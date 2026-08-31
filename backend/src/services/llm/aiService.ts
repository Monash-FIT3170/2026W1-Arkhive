import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import type { Message, ReviewField } from '../../models/message';
import dotenv from 'dotenv';
import { ExtractedData } from '../../models/TableData';
import { buildFocusedContext } from './utils/contextMaker';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// applies the users intent to the current document context and returns updated context
function applyIntentToContext(context: ExtractedData, intent: any): ExtractedData {
  const updated: ExtractedData = {
    ...context,
    columns: [...context.columns],
    rows: context.rows.map((row) => ({ ...row })),
  };

  if (intent.type === 'column_correction' && intent.updates) {
    //rename columns
    updated.columns = updated.columns.map((col: string) => {
      const match = intent.updates.find((u: any) => u.from === col);
      return match ? match.to : col;
    });

    //rename keys
    updated.rows = updated.rows.map((row) => {
      const newRow = { ...row };
      intent.updates.forEach(({ from, to }: { from: string; to: string }) => {
        if (from in newRow) {
          newRow[to] = newRow[from];
          delete newRow[from];
        }
      });
      return newRow;
    });
  }

  //remove deleted columns from column list
  if (intent.type === 'column_delete' && intent.deletedColumns) {
    updated.columns = updated.columns.filter((col: string) => !intent.deletedColumns.includes(col));

    //remove deleted column keys
    updated.rows = updated.rows.map((row) => {
      const newRow = { ...row };
      intent.deletedColumns.forEach((col: string) => {
        delete newRow[col];
      });
      return newRow;
    });
  }

  //update cell value
  if (intent.type === 'correction' && intent.rowId && intent.column && intent.newValue) {
    updated.rows = updated.rows.map((row) => {
      if (row._id === intent.rowId) {
        return { ...row, [intent.column]: intent.newValue };
      }
      return row;
    });
  }

  //apply a batch of cell updates in one go
  if (intent.type === 'bulk_update' && intent.bulkUpdates) {
    const rowIdToUpdates = new Map<string, any[]>();
    intent.bulkUpdates.forEach((u: any) => {
      const key = String(u.rowId);
      if (!rowIdToUpdates.has(key)) {
        rowIdToUpdates.set(key, []);
      }
      rowIdToUpdates.get(key)!.push(u);
    });
    updated.rows = updated.rows.map((row) => {
      const rowUpdates = rowIdToUpdates.get(String(row._id));
      if (!rowUpdates) return row;
      const newRow = { ...row };
      rowUpdates.forEach((u) => {
        newRow[u.column] = u.newValue;
      });
      return newRow;
    });
  }
  return updated;
}

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
            'column_header_add',
            'bulk_update',
          ],
        },
        column: {
          type: SchemaType.STRING,
          description:
            "The specific column header from the provided document context (e.g., 'Price', 'Quantity').",
        },
        rowId: {
          type: SchemaType.STRING,
          description:
            "The unique '_id' of the exact row the user wants to modify (extracted from the provided document context).",
        },
        oldValue: {
          type: SchemaType.STRING,
          description: 'The previous value or column name.',
        },
        newValue: {
          type: SchemaType.STRING,
          description: "The new value or column name (e.g., 'banana').",
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
              from: {
                type: SchemaType.STRING,
                description: 'The current column name.',
              },
              to: {
                type: SchemaType.STRING,
                description: 'The new column name.',
              },
            },
            required: ['from', 'to'],
          },
        },
        deletedColumns: {
          type: SchemaType.ARRAY,
          description: 'A list of column names to delete (for column_delete).',
          items: {
            type: SchemaType.STRING,
          },
        },
        bulkUpdates: {
          type: SchemaType.ARRAY,
          description:
            'A list of cell updates to apply in bulk (for bulk_update), e.g. applying the same transformation to every value in a column.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              rowId: {
                type: SchemaType.STRING,
                description:
                  "The unique '_id' of the exact row to modify (extracted from the provided document context).",
              },
              column: {
                type: SchemaType.STRING,
                description: 'The specific column header key from the provided document context.',
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
      required: ['type', 'column', 'newValue', 'rowId'],
    },
  },
  required: ['response'],
};

const formatDetectionSchema: Schema = {
  type: SchemaType.OBJECT,
  description:
    'A map of column names to a regular expression validating their dominant structural format (separators, punctuation, casing, digit/letter layout) -- not limited to Date, Time, or Currency.',
  properties: {
    formats: {
      type: SchemaType.ARRAY,
      description:
        'List of columns with a detected dominant structural format, and a regex matching it.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          column: {
            type: SchemaType.STRING,
            description: 'The name of the column.',
          },
          regex: {
            type: SchemaType.STRING,
            description:
              'The regular expression validating the most common structural pattern in this column.',
          },
        },
        required: ['column', 'regex'],
      },
    },
  },
  required: ['formats'],
};

export default {
  sendMessageToGemini: async (
    messages: Message[],
    documentContext: ExtractedData | undefined
  ): Promise<any> => {
    //turn into string
    const formattedContext = JSON.stringify(documentContext, null, 2);

    //set up model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are an AI assistant helping a user validate and correct a digitized document/table. 
            Analyse the user's message. 
						
						If they want to change data in a specific cell (e.g., 'change apples to bananas in row X'), extract the intent as a 'correction'.
						When the user wants to correct a cell value, you MUST:
						1. Set type to 'correction'
						2. Set rowId to the exact '_id' value of the row (e.g. 'comp_3')
						3. Set column to the exact column header key from the table context (e.g. 'ITEM', 'QTY', 'PRICE')
						4. Set newValue to the replacement value the user specified
						Never leave these fields empty for a correction intent.
						

            If they confirm the columns look correct, use the 'column_confirm' intent and set 'approved' to true.
            If they want to rename one or more column headers (e.g., 'change column header Supplier to Vendor Name'), use the 'column_correction' intent and populate the 'updates' array.
            If they want to remove or delete one or more columns (e.g., 'delete the tax column'), use the 'column_delete' intent and populate the 'deletedColumns' array.
            If they want to apply the same change across many cells (e.g., 'add a $ prefix to every value in the PRICE column'), use the 'bulk_update' intent and populate the 'bulkUpdates' array with one entry per affected cell: 'rowId' from the document context, 'column' as the exact column header key, and 'newValue' as the fully transformed value. Never leave a cell out of 'bulkUpdates' that the user asked to change.
            If they approve or reject the document generally, use the 'approval' or 'rejection' intent.
            Always be polite and confirm what you are doing in the 'response' field.
            
            CURRENT TABLE CONTEXT:
            The following JSON represents the current state of the extracted table, including its column headers and row data. 
            Use this data to understand exactly what the user is referring to when they ask for corrections:
            
            ${formattedContext}
            `,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: chatResponseSchema,
      },
    });
    console.log(formattedContext);
    // Gemini uses a history array + a final user message separately
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

    console.log(history);

    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage);

    const parsed = JSON.parse(result.response.text());

    const updatedContext =
      parsed.intent &&
      documentContext &&
      ['correction', 'column_correction', 'column_delete', 'bulk_update'].includes(
        parsed.intent.type
      )
        ? applyIntentToContext(documentContext, parsed.intent)
        : undefined;

    return {
      ...parsed,
      updatedContext,
    };

    // return JSON.parse(result.response.text());
  },
  suggestFieldCorrection: async (
    field: ReviewField,
    documentContext: ExtractedData
  ): Promise<any> => {
    const { rowIndex, otherFieldsInRow, columnValuesFromOtherRows, columnType } =
      buildFocusedContext(documentContext, field);

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
        1. Look at the surrounding row and column data in the table context below to judge what the value most likely should be.
        2. Clean and normalize the OCR value. Remove any unnecessary leading/trailing whitespace, stray punctuation (like leading hyphens, bullets, or random dots), and formatting artifacts. The corrected value should make logical sense within the context of the document and match the pattern of other rows. Do NOT just echo the literal OCR value back if it contains these artifacts.
        3. Write a short, specific question for the user confirming this one field (e.g. "The quantity in this row looks like it could be 8 or 3 — did you mean 8?"). Put this in 'response'.
        4. Set 'intent.type' to 'correction', 'intent.rowId' to "${field.rowId}", 'intent.column' to "${field.column}", and 'intent.newValue' to your cleaned, best-guess corrected value.
        5. Set 'intent.oldValue' to the original OCR value "${field.value}".
        6. Set 'intent.note' to a brief reason (e.g. "Removed stray hyphen and whitespace").

        Only address this one field. Do not comment on or change any other cell.

        `,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: chatResponseSchema, // reused as-is — same shape works
        temperature: 0.2,
      },
    });

    const result = await model.generateContent(
      `Please review the "${field.column}" field at row index ${rowIndex}.`
    );
    const parsed = JSON.parse(result.response.text());

    const updatedContext =
      parsed.intent && parsed.intent.type === 'correction'
        ? applyIntentToContext(documentContext, parsed.intent)
        : undefined;

    return { ...parsed, updatedContext };
  },
  suggestBulkFieldCorrections: async (
    column: string,
    fields: ReviewField[],
    documentContext: ExtractedData,
    formatRegex?: string
  ): Promise<any> => {
    const flaggedIds = new Set(fields.map((f) => String(f.rowId)));

    const rowContexts = fields.map(({ rowId }) => {
      const row = documentContext.rows.find((r) => String(r._id) === String(rowId));
      if (!row) return { rowId, otherFields: {} };
      const { _id, _cellKeyMap, _confidence, _cellConfidence, ...otherFields } = row;
      return { rowId, otherFields };
    });

    const referenceValues = documentContext.rows
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
    2. Set 'intent.type' to 'bulk_update'.
    3. Populate 'intent.bulkUpdates' with EXACTLY one entry per flagged row: 'rowId' (the exact id given above), 'column' set to "${column}", and 'newValue' as your corrected value. Do not omit any row.
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

    const updatedContext =
      parsed.intent && parsed.intent.type === 'bulk_update'
        ? applyIntentToContext(documentContext, parsed.intent)
        : undefined;

    return { ...parsed, updatedContext };
  },
  //This function was made with the help of Google Gemini
  detectTableFormats: async (sampledData: Record<string, string[]>): Promise<any> => {
    const formattedSample = JSON.stringify(sampledData, null, 2);

    // const model = genAI.getGenerativeModel({
    //   model: 'gemini-2.5-flash',
    //   systemInstruction: `You are an AI assistant helping validate table data extracted via OCR.
    //   Your task is to identify which columns represent Dates, Times, or Currencies based on the provided sample data.
    //   For each column that you identify as Date, Time, or Currency, provide a regular expression that matches the most common format found in the sample for that column.
    //   Do not include columns that are not Dates, Times, or Currencies (e.g. ignore text, names, generic IDs, statuses, etc.).

    //   Here is the sample of the first few non-empty rows for each column:
    //   ${formattedSample}

    //   Return the results as a list of { column, regex } objects inside 'formats'.
    //   Make sure the regex is strict enough to catch formatting inconsistencies, e.g. '\\d{2}-\\d{2}-\\d{4}' or '\\$\\d+\\.\\d{2}'.
    //   `,
    //   generationConfig: {
    //     responseMimeType: 'application/json',
    //     responseSchema: formatDetectionSchema,
    //     temperature: 0.1,
    //   },
    // });

    // const result = await model.generateContent('Identify Date, Time, and Currency columns and provide validation regexes.');
    console.log('SENT TO MODEL:\n', formattedSample);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: `You are an AI assistant helping validate table data extracted via OCR.

        Look at each column's sample values. If most non-empty values share the same structural
        pattern (separators, punctuation, casing, digit/letter layout -- not just Dates, Times,
        Currency), return a regex matching that dominant pattern.

        Also use the column's likely MEANING as a signal, inferred from its name and the values
        that make semantic sense together -- not just raw frequency in the sample:
        - A column that's clearly numeric/quantity/ID-like by name and mostly-digit values
        should be treated as a digits-only pattern. A non-digit placeholder (e.g. "-", "N/A")
        is almost always an OCR error or missing-value marker, not a legitimate alternate
        format -- exclude it from the regex even if it appears in a large share of the sample.
        - A leaked, semantically unrelated prefix or suffix stuck onto an otherwise consistent
        value (e.g. a stray number or character attached to a code/ID on only some rows) is
        more likely an OCR artifact than part of the actual value. Prefer the pattern for the
        coherent underlying value over one that includes such leaked tokens, even if the
        leaked version appears often in the sample.

        When raw frequency and semantic plausibility disagree, prefer semantic plausibility --
        a small sample can make a formatting bug look common by chance, so don't let sample
        frequency alone justify treating an implausible variant as the accepted format.

        CRITICAL RULE: DO NOT use optional characters (e.g. "?", "*") or alternations ("|") to 
        accommodate minority formats or inconsistencies in the sample (e.g. allowing a "$" just 
        because one row has it, while others don't). The regex MUST strictly define the single 
        most dominant format. Any deviations from that strict dominant format are supposed to 
        fail the regex check.

        The regex must match ONLY the dominant, semantically-correct pattern -- outliers and
        noise are supposed to fail to match, that's what flags them for review.

        Skip a column if: it's genuinely free text (names, addresses, notes), it has no clear
        majority pattern (roughly evenly mixed structures) AND no semantic reason to prefer one,
        or the sample has under 3 non-empty values.

        Sample (random rows per column):
        ${formattedSample}

        Return { column, regex } objects inside 'formats'.
        Examples: '\\d{2}-\\d{2}-\\d{4}' (date), '\\$\\d+\\.\\d{2}' (currency), '^\\d+$' (small integer column).
        `,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: formatDetectionSchema,
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(
      'Identify columns with a consistent format and provide validation regexes for each, following the rules above.'
    );
    console.log('RAW RESPONSE:\n', result.response.text());
    const parsed = JSON.parse(result.response.text());

    // Convert { formats: [{column, regex}] } into Record<string, string>
    const regexMap: Record<string, string> = {};
    if (parsed.formats && Array.isArray(parsed.formats)) {
      parsed.formats.forEach((f: any) => {
        if (f.column && f.regex) {
          regexMap[f.column] = f.regex;
        }
      });
    }

    return regexMap;
  },
};
