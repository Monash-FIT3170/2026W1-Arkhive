import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import type { Message, ReviewField, Intent, AppliedEdits } from '../../models/message';
import dotenv from 'dotenv';
import type { ExtractedData, ExtractedPage, ExtractedRow } from '../../models/TableData';
import { buildFocusedContext } from './utils/contextMaker';
import { profileColumnLocally } from './utils/formatUtils';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ─────────────────────────────────────────────────────────────────────────────
// Page-aware intent application
//
// The page is: one ACTIVE table (top-level columns/rows, identified by
// page.tableId), any number of parked tables (page.otherTables), plus
// key/value `fields` and `texts`. Every function below returns a new page and
// reports exactly what it changed, so callers never claim success on a no-op.
// ─────────────────────────────────────────────────────────────────────────────

type Grid = ExtractedData;

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

/** The grid for a tableId (active grid when omitted / equal to page.tableId). */
function getGrid(page: ExtractedPage, tableId?: string): Grid | undefined {
  if (!tableId || tableId === page.tableId) return page;
  return page.otherTables?.find((t) => t.tableId === tableId);
}

function rowExists(grid: Grid | undefined, rowId: unknown): boolean {
  return !!grid?.rows.some((r) => sameId(r._id, rowId));
}

/**
 * Which table holds this row? Trust the model's tableId if the row is really
 * there, otherwise search (row ids come from the flattener and are unique per
 * block, but the model can still mislabel the table).
 */
function locateRow(page: ExtractedPage, rowId: unknown, hinted?: string): string | undefined {
  if (hinted && rowExists(getGrid(page, hinted), rowId)) return hinted;
  if (rowExists(page, rowId)) return page.tableId;
  return page.otherTables?.find((t) => rowExists(t, rowId))?.tableId;
}

/** Apply fn to one table and write the result back to the right place on the page. */
function editGrid(
  page: ExtractedPage,
  tableId: string | undefined,
  fn: (g: Grid) => Grid
): ExtractedPage {
  if (!tableId || tableId === page.tableId) {
    const next = fn(page);
    return { ...page, columns: next.columns, rows: next.rows, itemColumnKey: next.itemColumnKey };
  }
  const others = page.otherTables ?? [];
  if (!others.some((t) => t.tableId === tableId)) return page; // unknown table: no-op
  return {
    ...page,
    otherTables: others.map((t) => {
      if (t.tableId !== tableId) return t;
      const next = fn(t);
      return { ...t, columns: next.columns, rows: next.rows, itemColumnKey: next.itemColumnKey };
    }),
  };
}

/** Set cell values. Only counts edits where both the row and the column exist. */
function setCells(
  grid: Grid,
  edits: { rowId: string | number; column: string; newValue: string }[]
): { grid: Grid; applied: { rowId: string | number; column: string }[] } {
  const applied: { rowId: string | number; column: string }[] = [];
  const rows = grid.rows.map((row) => {
    const mine = edits.filter(
      (e) =>
        sameId(e.rowId, row._id) && grid.columns.includes(e.column) && !e.column.startsWith('_')
    );
    if (!mine.length) return row;
    const next: ExtractedRow = { ...row, _cellConfidence: { ...row._cellConfidence } };
    for (const e of mine) {
      next[e.column] = e.newValue ?? '';
      next._cellConfidence[e.column] = 1; // human-confirmed; keep in sync with useTableEditor.editCell
      applied.push({ rowId: row._id, column: e.column });
    }
    return next;
  });
  return { grid: { ...grid, rows }, applied };
}

/** Rename columns (columns are the flattener's keys). Moves every per-column map with them. */
function renameColumns(
  grid: Grid,
  updates: { from: string; to: string }[]
): { grid: Grid; count: number } {
  const valid = updates.filter(
    (u) => grid.columns.includes(u.from) && u.to && u.to !== u.from && !grid.columns.includes(u.to)
  );
  if (!valid.length) return { grid, count: 0 };
  const map = new Map(valid.map((u) => [u.from, u.to]));
  return {
    count: valid.length,
    grid: {
      ...grid,
      columns: grid.columns.map((c) => map.get(c) ?? c),
      itemColumnKey: map.get(grid.itemColumnKey) ?? grid.itemColumnKey,
      rows: grid.rows.map((row) => {
        const next: ExtractedRow = {
          ...row,
          _cellConfidence: { ...row._cellConfidence },
          _cellKeyMap: row._cellKeyMap ? { ...row._cellKeyMap } : undefined,
        };
        for (const [from, to] of map) {
          if (from in next) {
            next[to] = next[from];
            delete next[from];
          }
          if (from in next._cellConfidence) {
            next._cellConfidence[to] = next._cellConfidence[from];
            delete next._cellConfidence[from];
          }
          if (next._cellKeyMap && from in next._cellKeyMap) {
            next._cellKeyMap[to] = next._cellKeyMap[from];
            delete next._cellKeyMap[from];
          }
        }
        return next;
      }),
    },
  };
}

function deleteColumns(grid: Grid, names: string[]): { grid: Grid; count: number } {
  const del = new Set(names.filter((c) => grid.columns.includes(c) && c !== grid.itemColumnKey));
  if (!del.size) return { grid, count: 0 };
  return {
    count: del.size,
    grid: {
      ...grid,
      columns: grid.columns.filter((c) => !del.has(c)),
      rows: grid.rows.map((row) => {
        const next: ExtractedRow = {
          ...row,
          _cellConfidence: { ...row._cellConfidence },
          _cellKeyMap: row._cellKeyMap ? { ...row._cellKeyMap } : undefined,
        };
        del.forEach((c) => {
          delete next[c];
          delete next._cellConfidence[c];
          if (next._cellKeyMap) delete next._cellKeyMap[c];
        });
        return next;
      }),
    },
  };
}

/**
 * Apply an LLM intent to a page. Returns the new page and what actually changed.
 * `applied.total === 0` means nothing matched and the caller must not pretend otherwise.
 */
function applyIntentToPage(
  page: ExtractedPage,
  intent: Intent
): { page: ExtractedPage; applied: AppliedEdits & { total: number } } {
  let result = page;
  const tableIds = new Set<string>();
  const cells: { rowId: string | number; column: string }[] = [];
  const blockIds: string[] = [];
  let total = 0;

  const touch = (tableId: string | undefined) => {
    const id = tableId ?? result.tableId;
    if (id) tableIds.add(id);
  };

  const applyCellEdits = (
    edits: { rowId: string | number; column: string; newValue: string; tableId?: string }[]
  ) => {
    // group by the table that really holds each row
    const groups = new Map<string, typeof edits>();
    for (const e of edits) {
      const tid = locateRow(result, e.rowId, e.tableId ?? intent.tableId) ?? '';
      groups.set(tid, [...(groups.get(tid) ?? []), e]);
    }
    for (const [tid, group] of groups) {
      result = editGrid(result, tid || undefined, (g) => {
        const r = setCells(g, group);
        if (r.applied.length) {
          cells.push(...r.applied);
          total += r.applied.length;
          touch(tid || undefined);
        }
        return r.grid;
      });
    }
  };

  switch (intent.type) {
    case 'correction':
      if (intent.rowId != null && intent.column && intent.newValue != null) {
        applyCellEdits([{ rowId: intent.rowId, column: intent.column, newValue: intent.newValue }]);
      }
      break;

    case 'bulk_update':
      applyCellEdits(intent.bulkUpdates ?? []);
      break;

    case 'column_correction':
      result = editGrid(result, intent.tableId, (g) => {
        const r = renameColumns(g, intent.updates ?? []);
        if (r.count) {
          total += r.count;
          touch(intent.tableId);
        }
        return r.grid;
      });
      break;

    case 'column_delete':
      result = editGrid(result, intent.tableId, (g) => {
        const r = deleteColumns(g, intent.deletedColumns ?? []);
        if (r.count) {
          total += r.count;
          touch(intent.tableId);
        }
        return r.grid;
      });
      break;

    case 'field_correction':
      if (intent.blockId && intent.newValue != null) {
        const id = intent.blockId;
        const newValue = intent.newValue;
        const hitField = result.fields?.some((f) => f.id === id);
        const hitText = result.texts?.some((t) => t.id === id);
        if (hitField || hitText) {
          result = {
            ...result,
            fields: result.fields?.map((f) => (f.id === id ? { ...f, value: newValue } : f)),
            texts: result.texts?.map((t) => (t.id === id ? { ...t, text: newValue } : t)),
          };
          blockIds.push(id);
          total += 1;
        }
      }
      break;
  }

  return { page: result, applied: { tableIds: [...tableIds], cells, blockIds, total } };
}

const EDIT_INTENTS: Intent['type'][] = [
  'correction',
  'column_correction',
  'column_delete',
  'bulk_update',
  'field_correction',
];

/** Run an intent against the page; returns what the endpoints should send back. */
function resolveEdit(page: ExtractedPage | undefined, intent: Intent | null | undefined) {
  if (!page || !intent || !EDIT_INTENTS.includes(intent.type)) {
    return { updatedContext: undefined, applied: undefined, nothingMatched: false };
  }
  const { page: next, applied } = applyIntentToPage(page, intent);
  if (applied.total === 0) {
    return { updatedContext: undefined, applied: undefined, nothingMatched: true };
  }
  const { total: _total, ...rest } = applied;
  return { updatedContext: next, applied: rest as AppliedEdits, nothingMatched: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context shown to the model
// ─────────────────────────────────────────────────────────────────────────────

/** Compact, explicit view of the page. Labels match the UI tabs ("Table 1", ...). */
function buildChatContext(page: ExtractedPage) {
  const order = page.tableOrder ?? (page.tableId ? [page.tableId] : []);
  const labelOf = (id?: string) => {
    const i = id ? order.indexOf(id) : -1;
    return i >= 0 ? `Table ${i + 1}` : 'Table';
  };
  const slim = (g: Grid, tableId: string | undefined, active: boolean) => ({
    tableId,
    label: labelOf(tableId),
    active,
    columns: g.columns,
    itemColumnKey: g.itemColumnKey,
    rows: g.rows.map(
      ({ _id, _cellKeyMap, _confidence, _cellConfidence, _indentLevel, ...cells }) => ({
        _id,
        ...cells,
      })
    ),
  });
  return {
    tables: [
      slim(page, page.tableId, true),
      ...(page.otherTables ?? []).map((t) => slim(t, t.tableId, false)),
    ].filter((t) => t.tableId),
    fields: page.fields?.map(({ id, key, label, value }) => ({ id, key, label, value })) ?? [],
    texts: page.texts?.map(({ id, role, text }) => ({ id, role, text })) ?? [],
  };
}

function resolveGrid(page: ExtractedPage, tableId?: string): Grid {
  return getGrid(page, tableId) ?? page;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const chatResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    response: {
      type: SchemaType.STRING,
      description: 'Your human-readable, conversational reply to the user.',
    },
    intent: {
      type: SchemaType.OBJECT,
      nullable: true,
      description:
        "The structured intent extracted from the user's request. Return null if no action is needed.",
      properties: {
        type: {
          type: SchemaType.STRING,
          format: 'enum',
          description: 'The type of action to take.',
          enum: [
            'correction',
            'context',
            'approval',
            'rejection',
            'unclear',
            'column_confirm',
            'column_correction',
            'column_delete',
            'bulk_update',
            'field_correction',
          ],
        },
        tableId: {
          type: SchemaType.STRING,
          description:
            'The tableId (from the page context) of the table this action targets. Omit only when the user means the table marked active.',
        },
        blockId: {
          type: SchemaType.STRING,
          description:
            "The id of a key/value field or text block (for field_correction), taken from the page context's 'fields' or 'texts'.",
        },
        column: {
          type: SchemaType.STRING,
          description:
            "The exact column name from the targeted table's 'columns' (e.g., 'Price', 'Quantity').",
        },
        rowId: {
          type: SchemaType.STRING,
          description: "The exact '_id' of the row to modify, from the targeted table's rows.",
        },
        oldValue: {
          type: SchemaType.STRING,
          description: 'The previous value or column name.',
        },
        newValue: {
          type: SchemaType.STRING,
          description:
            "The new value or column name (e.g., 'banana'). May be an empty string to clear a cell.",
        },
        note: {
          type: SchemaType.STRING,
          description: 'Any extra context or reasoning the user provided.',
        },
        approved: {
          type: SchemaType.BOOLEAN,
          description: 'True if the user confirmed the columns are correct (for column_confirm).',
        },
        updates: {
          type: SchemaType.ARRAY,
          description: 'A list of column name updates (for column_correction).',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              from: { type: SchemaType.STRING, description: 'The current column name.' },
              to: { type: SchemaType.STRING, description: 'The new column name.' },
            },
            required: ['from', 'to'],
          },
        },
        deletedColumns: {
          type: SchemaType.ARRAY,
          description: 'A list of column names to delete (for column_delete).',
          items: { type: SchemaType.STRING },
        },
        bulkUpdates: {
          type: SchemaType.ARRAY,
          description:
            'A list of cell updates to apply in bulk (for bulk_update), e.g. applying the same transformation to every value in a column.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              tableId: {
                type: SchemaType.STRING,
                description: 'The tableId this cell belongs to.',
              },
              rowId: {
                type: SchemaType.STRING,
                description: "The exact '_id' of the row to modify.",
              },
              column: {
                type: SchemaType.STRING,
                description: 'The exact column name in that table.',
              },
              newValue: {
                type: SchemaType.STRING,
                description: 'The new, transformed value for this cell.',
              },
            },
            required: ['rowId', 'column', 'newValue'],
          },
        },
      },
      // Only `type` is universal; approvals/unclear have no row, column or value.
      required: ['type'],
    },
  },
  required: ['response'],
};

const formatDetectionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    formats: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          column: { type: SchemaType.STRING },
          isFreeText: {
            type: SchemaType.BOOLEAN,
            description:
              'True if the column is arbitrary text (names, addresses, comments, descriptions) with no strict structural rules.',
          },
          reasoning: {
            type: SchemaType.STRING,
            description:
              'Deduce the intended structural format. Explicitly note any OCR errors or inconsistencies in the samples that your strict regex will intentionally reject.',
          },
          regex: {
            type: SchemaType.STRING,
            description:
              "A STRICT Javascript regex matching ONLY the perfect intended format. Do not allow OCR noise. Example: '^([A-Z]{2,3})-\\d{4}$'",
          },
        },
        required: ['column', 'isFreeText', 'reasoning', 'regex'],
      },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export default {
  sendMessageToGemini: async (
    messages: Message[],
    documentContext: ExtractedPage | undefined
  ): Promise<any> => {
    const formattedContext = documentContext
      ? JSON.stringify(buildChatContext(documentContext), null, 2)
      : 'null';

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are an AI assistant helping a user validate and correct a digitized document page.
The page can contain SEVERAL tables plus key/value fields (invoice number, date, total...) and text blocks.
Analyse the user's message and extract a structured intent.

TARGETING RULES (important):
- Every table has a 'tableId' and a 'label' ("Table 1", "Table 2"... matching the tabs the user sees). One table has active:true: that is the one currently on the user's screen.
- If the user names a table ("in table 2"), use that table's tableId. Otherwise, if they refer to a value or column, pick the table that actually contains it; if it is ambiguous, prefer the active table.
- For any table action, set intent.tableId to the chosen table's tableId.
- 'rowId' must be an exact '_id' from THAT table's rows. 'column' must be an exact entry from THAT table's 'columns'. Never invent either.
- Columns named SUB_* hold nested (indented) levels of the item column; edit them like any other column.

INTENTS:
- Change one cell (e.g. 'change apples to bananas in row X'): type 'correction' with tableId, rowId, column, newValue.
- Change a key/value field or text block (e.g. 'the invoice number should be 4411'): type 'field_correction' with blockId (the id from 'fields' or 'texts') and newValue.
- Apply the same change across many cells (e.g. 'add a $ prefix to every value in the PRICE column'): type 'bulk_update'; one 'bulkUpdates' entry per affected cell, each with tableId, rowId, column and the fully transformed newValue. Never leave out a cell the user asked to change.
- Rename column headers: type 'column_correction' with tableId and the 'updates' array.
- Delete columns: type 'column_delete' with tableId and 'deletedColumns'.
- The user confirms the columns look correct: 'column_confirm' with approved true.
- The user approves or rejects the document generally: 'approval' or 'rejection'.
- If the request is not actionable or you cannot tell which cell they mean, use 'unclear' (or null) and ask a short clarifying question in 'response'. Do not guess a row.
Always be polite and confirm what you are doing in the 'response' field.

CURRENT PAGE CONTEXT:
${formattedContext}
`,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: chatResponseSchema,
      },
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage);
    const parsed = JSON.parse(result.response.text());

    const { updatedContext, applied, nothingMatched } = resolveEdit(documentContext, parsed.intent);
    if (nothingMatched) {
      parsed.response = `${parsed.response}\n\n(I couldn't match that to a cell in the document, so nothing was changed. Could you tell me which table and row you mean?)`;
      parsed.intent = null; // don't show Accept/Reject for a no-op
    }

    return { ...parsed, updatedContext, applied };
  },

  suggestFieldCorrection: async (
    field: ReviewField,
    documentContext: ExtractedPage
  ): Promise<any> => {
    const tableId = field.tableId ?? documentContext.tableId;
    const grid = resolveGrid(documentContext, tableId);
    const { rowIndex, otherFieldsInRow, columnValuesFromOtherRows, columnType } =
      buildFocusedContext(grid, field);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are helping verify OCR-extracted table data. One specific cell has been flagged for review.

      The cell in question:
      - Row position: index ${rowIndex} in the rows array (0-indexed) — ignore any row ID, use this position
      - Column: "${field.column}" — inferred column type: ${columnType}
      - OCR-read value: "${field.value}"
      - Flag Reason: ${field.issueType === 'format' ? 'Formatting Inconsistency' : 'Low OCR Confidence'}

        Other already-confirmed values in this same row, for context:
        ${JSON.stringify(otherFieldsInRow, null, 2)}

        This column's values from other rows, to judge typical format/range/pattern:
        ${JSON.stringify(
          columnValuesFromOtherRows.map((r) => r.value),
          null,
          2
        )}

        Your job:
        1. Look at the surrounding row and column data to judge what the value most likely should be.
        2. Clean and normalize the OCR value. Remove any unnecessary leading/trailing whitespace, stray punctuation (like leading hyphens, bullets, or random dots), and formatting artifacts. The corrected value should make logical sense within the context of the document and match the pattern of other rows. Do NOT just echo the literal OCR value back if it contains these artifacts.
        3. Write a short, specific question for the user confirming this one field (e.g. "The quantity in this row looks like it could be 8 or 3 — did you mean 8?"). Put this in 'response'.
        4. Set 'intent.type' to 'correction', 'intent.rowId' to "${field.rowId}", 'intent.column' to "${field.column}", 'intent.tableId' to "${tableId ?? ''}", and 'intent.newValue' to your cleaned, best-guess corrected value.
        5. Set 'intent.oldValue' to the original OCR value "${field.value}".
        6. Set 'intent.note' to a brief reason (e.g. "Removed stray hyphen and whitespace").

        Only address this one field. Do not comment on or change any other cell.
        `,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: chatResponseSchema,
        temperature: 0.2,
      },
    });

    const result = await model.generateContent(
      `Please review the "${field.column}" field at row index ${rowIndex}.`
    );
    const parsed = JSON.parse(result.response.text());

    // The target is known for certain here, so don't leave it to the model.
    if (parsed.intent) {
      parsed.intent.type = 'correction';
      parsed.intent.rowId = String(field.rowId);
      parsed.intent.column = field.column;
      parsed.intent.tableId = tableId;
    }

    const { updatedContext, applied } = resolveEdit(documentContext, parsed.intent);
    return { ...parsed, updatedContext, applied };
  },

  suggestBulkFieldCorrections: async (
    column: string,
    fields: ReviewField[],
    documentContext: ExtractedPage,
    formatRegex?: string,
    requestedTableId?: string
  ): Promise<any> => {
    const tableId = requestedTableId ?? fields[0]?.tableId ?? documentContext.tableId;
    const grid = resolveGrid(documentContext, tableId);
    const flaggedIds = new Set(fields.map((f) => String(f.rowId)));

    const rowContexts = fields.map(({ rowId }) => {
      const row = grid.rows.find((r) => String(r._id) === String(rowId));
      if (!row) return { rowId, otherFields: {} };
      const { _id, _cellKeyMap, _confidence, _cellConfidence, _indentLevel, ...otherFields } = row;
      return { rowId, otherFields };
    });

    const referenceValues = grid.rows
      .filter((r) => !flaggedIds.has(String(r._id)))
      .map((r) => r[column])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .slice(0, 20);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are helping verify OCR-extracted table data. Multiple cells in the SAME column "${column}" have been flagged as inconsistent with the column's expected format.

    ${
      formatRegex
        ? `The column's expected format was detected as this regular expression: ${formatRegex}. Every corrected value MUST match this pattern exactly.`
        : ''
    }

    The flagged cells, with the rest of their row for context:
    ${JSON.stringify(rowContexts, null, 2)}

    Values from OTHER rows in this same column that already look correctly formatted, for reference:
    ${JSON.stringify(referenceValues, null, 2)}

    Your job:
    1. For EACH flagged row, clean and normalize its "${column}" value so it matches the expected format. Remove stray punctuation/whitespace/OCR artifacts. Use the row's other fields and the reference values to judge the most plausible correction -- don't just blindly strip characters if that produces a value that doesn't make sense in context.
    2. Set 'intent.type' to 'bulk_update' and 'intent.tableId' to "${tableId ?? ''}".
    3. Populate 'intent.bulkUpdates' with EXACTLY one entry per flagged row: 'rowId' (the exact id given above), 'column' set to "${column}", 'tableId' set to "${tableId ?? ''}", and 'newValue' as your corrected value. Do not omit any row.
    4. Set 'response' to a short, one-sentence summary of what you changed and why.
    `,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: chatResponseSchema,
        temperature: 0.2,
      },
    });

    const result = await model.generateContent(
      `Please review and correct the "${column}" field across the ${fields.length} flagged rows.`
    );
    const parsed = JSON.parse(result.response.text());

    if (parsed.intent) {
      parsed.intent.type = 'bulk_update';
      parsed.intent.tableId = tableId;
      parsed.intent.bulkUpdates = (parsed.intent.bulkUpdates ?? []).map((u: any) => ({
        ...u,
        column,
        tableId,
      }));
    }

    const { updatedContext, applied } = resolveEdit(documentContext, parsed.intent);
    return { ...parsed, updatedContext, applied };
  },

  //This function was made with the help of Google Gemini
  detectTableFormats: async (sampledData: Record<string, string[]>): Promise<any> => {
    const finalRegexMap: Record<string, string> = {};
    const unresolvedSamples: Record<string, string[]> = {};

    // 1. Run local profiler first (Fast Path - ~1ms)
    for (const [col, samples] of Object.entries(sampledData)) {
      const localRegex = profileColumnLocally(samples);
      if (localRegex) {
        finalRegexMap[col] = localRegex;
      } else {
        unresolvedSamples[col] = samples;
      }
    }

    // If local rules resolved all columns, skip Gemini call entirely!
    if (Object.keys(unresolvedSamples).length === 0) {
      return finalRegexMap;
    }

    // 2. Query Gemini only for unresolved/custom formats
    const formattedSample = JSON.stringify(unresolvedSamples, null, 2);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      systemInstruction: `You are an AI data architect building validation rules for an OCR system.
        CRITICAL CONTEXT: You are evaluating a small, random sample of a larger dataset. Defend against "Small Sample Bias."

        CRITICAL PRINCIPLES:
        1. AGGRESSIVE TYPE COERCION (Defeating Noise Bias): If the column name implies a pure primitive type (e.g., counters, metrics, latencies, amounts, indices), write a strict numeric/primitive regex (e.g., '^\\d+$' or '^\\d+(\\.\\d+)?$'). Ignore appended text or OCR bleed, even if present across multiple sample rows.
        2. BROAD IDENTIFIERS (Defeating Uniformity Bias): For generic codes, reference IDs, or serial tags, do not overfit to the exact length or punctuation seen in a small sample. Use broad classes like '^[\\w\\s.,/-]+$' to allow natural variance in unseen rows.
        3. SEMI-STRUCTURED / HYBRID DATA: If entries contain a strict prefix or state tag followed by free text, enforce the prefix strictly but use '.*' for the remainder of the string.
        4. STRICT REGULATED FORMATS: Reserve rigid, exact-character regexes for standardized formats (e.g., dates, ISO codes, exact fixed-length checksums).
        5. FREE TEXT: If a column contains natural language, arbitrary names, or notes, set isFreeText to true so it evaluates to '.*'.

        EXAMPLES:
        Column: "Telemetry_Ping_ms"
        Samples: ["45", "42", "48 BAD_SIGNAL", "41"]
        Reasoning: "The column name specifies a numeric metric in milliseconds. 'BAD_SIGNAL' is appended OCR/log noise. The true target format is strictly digits."
        Regex: "^\\d+$"

        Column: "Asset_Tag"
        Samples: ["AST-101", "AST-102", "AST-103"]
        Reasoning: "Even though this small sample appears uniform, generic asset identifiers vary in length and separators across systems. I will use a broad identifier pattern."
        Regex: "^[\\w\\s.,/-]+$"

        Column: "System_Log_Level"
        Samples: ["[CRITICAL] Server CPU Overheat", "[NORMAL] Disk usage at 40%"]
        Reasoning: "Hybrid data: strict log bracket tag followed by free-form narrative text. Enforce the bracketed tag strictly, then allow '.*' for the rest."
        Regex: "^\\[(CRITICAL|NORMAL|WARNING)\\]\\s+.*$"

        Sample data:
        ${formattedSample}`,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: formatDetectionSchema,
        temperature: 0.1,
      },
    });

    try {
      const result = await model.generateContent(
        'Identify structural format masks for the provided columns.'
      );
      const parsed = JSON.parse(result.response.text());
      if (parsed.formats && Array.isArray(parsed.formats)) {
        parsed.formats.forEach((f: any) => {
          if (f.column) {
            finalRegexMap[f.column] = f.isFreeText ? '.*' : f.regex;
          }
        });
      }
    } catch (error) {
      console.error('Error during LLM format detection fallback:', error);
    }

    return finalRegexMap;
  },
};
