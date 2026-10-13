import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import type { Message, ReviewField } from '../../models/message';
import dotenv from 'dotenv';
import type { ExtractedPage } from '../../models/TableData';
import { buildFocusedContext, inferColumnType, rowNeighbours } from './utils/contextMaker';
import { profileColumnLocally } from './utils/formatUtils';
import { getGrid, resolveEdit, resolveWithRetry, type Grid } from './utils/intentApplier';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
          description:
            'ONLY for column_correction: renaming column headers as {from, to}. NEVER use this array to change actual cell data/numbers.',
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
          description:
            "REQUIRED for column_delete: the exact names of the columns to delete, copied from the targeted table's 'columns'. Never empty for column_delete.",
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

/**
 * The chat endpoint may legitimately return no intent (approvals, "unclear"), but
 * the review endpoints exist to produce a value: the intent must be present and
 * carry the fields the UI reads.
 */
const withIntentRequired = (required: string[]): Schema => ({
  ...chatResponseSchema,
  properties: {
    ...chatResponseSchema.properties,
    intent: { ...(chatResponseSchema.properties!.intent as any), nullable: false, required },
  },
  required: ['response', 'intent'],
});
const reviewFieldSchema = withIntentRequired(['type', 'rowId', 'column', 'newValue']);
const reviewBulkSchema = withIntentRequired(['type', 'bulkUpdates']);

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
      model: 'gemini-3.5-flash-lite',
      systemInstruction: `You are an AI assistant helping a user validate and correct a digitized document page.
CONTEXT: The page contains tables (with 'tableId'), key/value 'fields', and 'texts'. One table has active:true.

CRITICAL RULES:
1. EXACT MATCHING: 'tableId', 'rowId' (from _id), and 'column' MUST exactly match the provided context. Never invent IDs. If ambiguous, prefer the active table.
2. BIAS TO ACTION: NEVER refuse an edit because you think it will cause data loss, duplicate values, or errors. If the user asks you to strip characters, clear cells, or overwrite data, do exactly what they asked without second-guessing. Obey instructions blindly regarding data manipulation. Explain what you did in 'response'.
3. RESTRICTIONS: Never edit, rename, or delete columns starting with "SUB_".
4. CALCULATIONS: Compute all final values yourself (e.g., math, row sequences). Leave blank cells out of updates.

INTENT TYPES (Choose exactly one):
- 'correction': Edit 1 cell. Requires: tableId, rowId, column, newValue.
- 'bulk_update': Edit multiple cells. Requires: 'bulkUpdates' array (list tableId, rowId, column, newValue for EVERY changed cell). NEVER use 'updates' here.
- 'column_correction': Rename headers. Requires: 'updates' array of {from, to}. NEVER use for cell data.
- 'column_delete': Delete columns. Requires: 'deletedColumns' array of string names. NEVER use 'updates' here.
- 'field_correction': Edit key/value fields. Requires: blockId, newValue.
- 'column_confirm': User approves columns. Requires: approved: true.
- 'approval' / 'rejection': General document approval.
- 'unclear': ONLY if request is impossible to interpret. Ask 1 short question.

Your 'response' must politely describe ONLY the changes actually included in your intent payload.

CURRENT PAGE CONTEXT:
${formattedContext}
`,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: chatResponseSchema,
        temperature: 0.2,
      },
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage);
    const first = JSON.parse(result.response.text());

    // If the intent didn't land on anything real, tell the model exactly why and let it
    // correct itself once. If that still fails, the user gets the truth instead of a
    // false "done!" (see resolveWithRetry).
    const { parsed, updatedContext, applied } = await resolveWithRetry(
      documentContext,
      first,
      async (reason) => {
        const retry = await chat.sendMessage(
          `That intent could not be applied: ${reason}\n` +
            `Send the intent again using the exact tableId, column names and row ids from the page context. ` +
            `Put column names to delete in 'deletedColumns' (never in 'updates'). ` +
            `If the request genuinely cannot be done, use type 'unclear' and explain in one sentence in 'response'.`
        );
        return JSON.parse(retry.response.text());
      }
    );

    return { ...parsed, updatedContext, applied };
  },

  suggestFieldCorrection: async (
    field: ReviewField,
    documentContext: ExtractedPage
  ): Promise<any> => {
    const tableId = field.tableId ?? documentContext.tableId;
    const grid = resolveGrid(documentContext, tableId);
    const {
      rowIndex,
      otherFieldsInRow,
      columnValuesFromOtherRows,
      columnType,
      previousRowValue,
      nextRowValue,
    } = buildFocusedContext(grid, field);

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      systemInstruction: `You are helping verify OCR-extracted table data. One specific cell has been flagged for review.

      The cell in question:
      - Row position: index ${rowIndex} in the rows array (0-indexed) — ignore any row ID, use this position
      - Column: "${field.column}" — inferred column type: ${columnType}
      - OCR-read value: "${field.value}"
      - Value in this column in the row directly above: ${JSON.stringify(previousRowValue)}
      - Value in this column in the row directly below: ${JSON.stringify(nextRowValue)}
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
        2. If the OCR value is blank, infer the most plausible value from the neighbouring rows and the column pattern (for example, continue a numbering sequence). Otherwise, clean and normalize the OCR value. Remove any unnecessary leading/trailing whitespace, stray punctuation (like leading hyphens, bullets, or random dots), and formatting artifacts. The corrected value should make logical sense within the context of the document and match the pattern of other rows. Do NOT just echo the literal OCR value back if it contains these artifacts.
        3. Write a short, specific question for the user confirming this one field (e.g. "The quantity in this row looks like it could be 8 or 3 — did you mean 8?"). Put this in 'response'.
        4. Set 'intent.type' to 'correction', 'intent.rowId' to "${field.rowId}", 'intent.column' to "${field.column}", 'intent.tableId' to "${tableId ?? ''}", and 'intent.newValue' to your cleaned, best-guess corrected value.
        5. Set 'intent.oldValue' to the original OCR value "${field.value}".
        6. Set 'intent.note' to a brief reason (e.g. "Removed stray hyphen and whitespace").

        Only address this one field. Do not comment on or change any other cell.
        `,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: reviewFieldSchema,
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

    // Per flagged row: its neighbours in this column (so a blank can continue a
    // sequence such as numbering) plus the rest of the row for context.
    const rowContexts = fields.map(({ rowId }) => {
      const { rowIndex, previousRowValue, nextRowValue } = rowNeighbours(grid, rowId, column);
      const row = grid.rows[rowIndex];
      if (!row) return { rowId, otherFields: {} };
      const { _id, _cellKeyMap, _confidence, _cellConfidence, _indentLevel, ...otherFields } = row;
      return { rowId, rowIndex, previousRowValue, nextRowValue, otherFields };
    });

    const referenceValues = grid.rows
      .filter((r) => !flaggedIds.has(String(r._id)))
      .map((r) => r[column])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .slice(0, 20);
    const columnType = inferColumnType(referenceValues.map(String));

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      systemInstruction: `You are helping verify OCR-extracted table data. Multiple cells in the SAME column "${column}" have been flagged as inconsistent with the column's expected format.

    ${
      formatRegex
        ? `The column's expected format was detected as this regular expression: ${formatRegex}. Every corrected value MUST match this pattern exactly.`
        : ''
    }

    The flagged cells, with the rest of their row for context:
    ${JSON.stringify(rowContexts, null, 2)}

    Values from OTHER rows in this same column that already look correctly formatted, for reference (inferred column type: ${columnType}):
    ${JSON.stringify(referenceValues, null, 2)}

    Your job:
    1. For EACH flagged row, clean and normalize its "${column}" value so it matches the expected format. Remove stray punctuation/whitespace/OCR artifacts. If a flagged cell is blank, infer the most plausible value from 'previousRowValue' / 'nextRowValue', the row's other fields and the reference values (for example, continue a numbering sequence); only return an empty string if there is genuinely no basis to infer one. Use the row's other fields and the reference values to judge the most plausible correction -- don't just blindly strip characters if that produces a value that doesn't make sense in context.
    2. Set 'intent.type' to 'bulk_update' and 'intent.tableId' to "${tableId ?? ''}".
    3. Populate 'intent.bulkUpdates' with EXACTLY one entry per flagged row: 'rowId' (the exact id given above), 'column' set to "${column}", 'tableId' set to "${tableId ?? ''}", and 'newValue' as your corrected value. Do not omit any row.
    4. Set 'response' to a short, one-sentence summary of what you changed and why.
    `,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: reviewBulkSchema,
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
