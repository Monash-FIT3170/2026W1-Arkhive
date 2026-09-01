import { SchemaType, Schema } from '@google/generative-ai';
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
  type: SchemaType.OBJECT,
  properties: {
    components: {
      type: SchemaType.ARRAY,
      description: 'List of OCR layout components extracted from the document',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: {
            type: SchemaType.STRING,
          },
          type: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['TITLE', 'HEADER', 'TABLE_ROW', 'BODY_TEXT', 'TABLE_COLS'],
          },
          indentation: {
            type: SchemaType.NUMBER,
          },
          y: {
            type: SchemaType.NUMBER,
          },
          layer: {
            type: SchemaType.INTEGER,
          },
          parentId: {
            type: SchemaType.STRING,
          },
          text: {
            type: SchemaType.STRING,
          },
          cells: {
            type: SchemaType.ARRAY,
            description:
              'One entry for EVERY column in the table, in column order — use an empty string "" for columns this row does not populate. Never omit an entry or shift values to skip blanks. Must have exactly as many entries as "boundingBoxes", in the same order.',
            items: {
              type: SchemaType.STRING,
            },
          },
          confidence: {
            type: SchemaType.NUMBER,
          },
          boundingBoxes: {
            type: SchemaType.ARRAY,
            description:
              'One entry for EVERY column in the table, in column order — including columns this row does not populate (use an empty "text" but still provide the correct "column" label and a vertices box for that grid position). Must have exactly as many entries as the "cells" array, in the same order.',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                columnKey: {
                  type: SchemaType.STRING, // e.g. "col_0", "col_1"
                },
                text: {
                  type: SchemaType.STRING,
                },
                column: {
                  type: SchemaType.STRING, // e.g. "Column 0"
                },
                confidence: {
                  type: SchemaType.NUMBER,
                },
                vertices: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      x: { type: SchemaType.NUMBER },
                      y: { type: SchemaType.NUMBER },
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

export type OCRBoundingBoxes = Record<string, OCRBoundingBox>;

export type Page = {
  page_num: number;
  components: OCRComponent[];
};

export type Pages = Page[];
