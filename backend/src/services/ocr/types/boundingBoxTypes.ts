import { Schema, Type } from '@google/genai';
export interface Vertex {
  x: number;
  y: number;
}

export interface OCRBoundingBox {
  text: string;
  column?: string;
  vertices: Vertex[];
  confidence: number;
}

export interface OCRComponent {
  id: string;
  type: 'TITLE' | 'HEADER' | 'TABLE_ROW' | 'BODY_TEXT' | 'TABLE_COLS';
  indentation: number;
  y: number;
  layer: number;
  parentId?: string;
  text: string;
  cells?: string[];
  confidence: number;
  boundingBoxes?: OCRBoundingBoxes;
}

export type OCRColumnBox = {
  text: string;
  column: string;
  vertices: Vertex[];
  confidence: number;
};

export type OCRColumnBoundingBoxes = Record<string, OCRColumnBox>;

export const geminiSchemaBBoxPrompt: Schema = {
  type: Type.OBJECT,
  properties: {
    components: {
      type: Type.ARRAY,
      description: 'List of OCR layout components extracted from the document',
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
          },
          type: {
            type: Type.STRING,
            format: 'enum',
            enum: ['TITLE', 'HEADER', 'TABLE_ROW', 'BODY_TEXT', 'TABLE_COLS'],
          },
          indentation: {
            type: Type.NUMBER,
          },
          y: {
            type: Type.NUMBER,
          },
          layer: {
            type: Type.INTEGER,
          },
          parentId: {
            type: Type.STRING,
          },
          text: {
            type: Type.STRING,
          },
          cells: {
            type: Type.ARRAY,
            description:
              'One entry for EVERY column in the table, in column order — use an empty string "" for columns this row does not populate. Never omit an entry or shift values to skip blanks. Must have exactly as many entries as "boundingBoxes", in the same order.',
            items: {
              type: Type.STRING,
            },
          },
          confidence: {
            type: Type.NUMBER,
          },
          boundingBoxes: {
            type: Type.ARRAY,
            description:
              'One entry for EVERY column in the table, in column order — including columns this row does not populate (use an empty "text" but still provide the correct "column" label and a vertices box for that grid position). Must have exactly as many entries as the "cells" array, in the same order.',
            items: {
              type: Type.OBJECT,
              properties: {
                columnKey: {
                  type: Type.STRING, // e.g. "col_0", "col_1"
                },
                text: {
                  type: Type.STRING,
                },
                column: {
                  type: Type.STRING, // e.g. "Column 0"
                },
                confidence: {
                  type: Type.NUMBER,
                },
                vertices: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                    },
                    required: ['x', 'y'],
                  },
                },
              },
              required: ['columnKey', 'text', 'column', 'vertices', 'confidence'],
            },
          },
        },
        required: [
          'id',
          'type',
          'indentation',
          'y',
          'boundingBoxes',
          'layer',
          'text',
          'confidence',
        ],
      },
    },
  },
  required: ['components'],
};

export const geminiSchemaBBoxPromptSimplified: Schema = {
  type: Type.OBJECT,
  properties: {
    components: {
      type: Type.ARRAY,
      description: 'List of OCR layout components extracted from the document',
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
          },
          type: {
            type: Type.STRING,
            format: 'enum',
            enum: ['TITLE', 'HEADER', 'TABLE_ROW', 'BODY_TEXT', 'TABLE_COLS'],
          },
          indentation: {
            type: Type.NUMBER,
          },
          y: {
            type: Type.NUMBER,
          },
          layer: {
            type: Type.INTEGER,
          },
          parentId: {
            type: Type.STRING,
          },
          text: {
            type: Type.STRING,
          },
          cells: {
            type: Type.ARRAY,
            description:
              'One entry for EVERY column in the table, in column order — use an empty string "" for columns this row does not populate. Never omit an entry or shift values to skip blanks. Must have exactly as many entries as "boundingBoxes", in the same order.',
            items: {
              type: Type.STRING,
            },
          },
          confidence: {
            type: Type.NUMBER,
          },
        },
        required: [
          'id',
          'type',
          'indentation',
          'y',
          'layer',
          'text',
          'confidence',
        ],
      },
    },
  },
  required: ['components'],
};


const geminiSchemaPureBboxes = {
  type: "OBJECT",
  properties: {
    components: {
      type: "ARRAY",
      description: "List of all structured page layout components.",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          type: {
            type: "STRING",
            enum: ["TITLE", "HEADER", "TABLE_COLS", "TABLE_ROW", "BODY_TEXT"],
          },
          text: { type: "STRING" },
          indentation: { type: "NUMBER" },
          y: { type: "NUMBER" },
          layer: { type: "NUMBER" },
          parentId: { type: "STRING" },
          cells: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          confidence: { type: "NUMBER" },
          boundingBoxes: {
            type: "ARRAY",
            description: "Array of bounding boxes for each column/cell in the component.",
            items: {
              type: "OBJECT",
              properties: {
                columnKey: { type: "STRING" },
                text: { type: "STRING" },
                column: { type: "STRING" },
                vertices: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      x: { type: "INTEGER" },
                      y: { type: "INTEGER" },
                    },
                    required: ["x", "y"],
                  },
                },
                confidence: { type: "NUMBER" },
              },
              required: ["columnKey", "text", "column", "vertices", "confidence"],
            },
          },
        },
        required: ["id", "type", "text", "boundingBoxes"],
      },
    },
  },
  required: ["components"],
};


export type OCRBoundingBoxes = Record<string, OCRBoundingBox>;

export type Page = {
  page_num: number;
  components: OCRComponent[];
};

export type Pages = Page[];
