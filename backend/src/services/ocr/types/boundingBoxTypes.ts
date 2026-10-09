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


export type OCRBoundingBoxes = Record<string, OCRBoundingBox>;

export type Page = {
  page_num: number;
  components: OCRComponent[];
};

export type Pages = Page[];
