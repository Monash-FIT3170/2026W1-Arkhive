import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import type { Message, ReviewField } from '../../models/message';
import dotenv from 'dotenv';
import { ExtractedData } from '../../models/TableData';
import { buildFocusedContext } from './utils/contextMaker';
import { maskToRegex, profileColumnLocally } from './utils/formatUtils';
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
  properties: {
    formats: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          column: { type: SchemaType.STRING },
          structuralMask: {
            type: SchemaType.STRING,
            description:
              "Template string: '9' for digit, 'A' for uppercase, 'a' for lowercase, 'X' for alphanumeric. Punctuation as-is (e.g. 'AAA-99-999', '$9,999.99').",
          },
          isVariableLength: {
            type: SchemaType.BOOLEAN,
            description:
              'True if values have dynamic length (e.g., quantities, standard floats), False for fixed-length codes.',
          },
        },
        required: ['column', 'structuralMask', 'isVariableLength'],
      },
    },
  },
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
    console.log(formattedSample);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: `You are an AI assistant validating OCR tables.
        Look at each column's sample values and identify the dominant structural character skeleton.

        Return a structuralMask using these placeholders:
        - '9' = Digit
        - 'A' = Uppercase letter
        - 'a' = Lowercase letter
        - 'X' = Any letter or digit
        - Punctuation, dashes, spaces stay as literal characters.

        Ignore occasional OCR noise/errors and find the dominant underlying format.
        Set isVariableLength to true if the column represents arbitrary numbers or free text.

        Skip free text columns (names, addresses, comments).

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
          if (f.column && f.structuralMask) {
            // Convert Gemini mask to safe JS regex locally
            finalRegexMap[f.column] = maskToRegex(f.structuralMask, Boolean(f.isVariableLength));
          }
        });
      }
    } catch (error) {
      console.error('Error during LLM format detection fallback:', error);
    }

    return finalRegexMap;
  },
};
