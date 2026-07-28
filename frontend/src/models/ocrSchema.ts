import { z } from 'zod';
// Acknowledgement: The development of this OCR schema was done with the help of Google Gemini

// Coordinate vertex schema
export const VertexSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// Bounding box for individual extracted cells
export const BoundingBoxCellSchema = z.object({
  text: z.string(),
  vertices: z.array(VertexSchema).length(4), // Always a 4-point bounding polygon
  confidence: z.number().min(0).max(1),
  column: z.string().optional(), // Columns are optional depending on row type
});

// The core node structure (flexible for HEADER, BODY_TEXT, TABLE_COLS, TABLE_ROW, FOOTER)
export const OcrComponentSchema = z.object({
  id: z.string(),
  type: z.enum(['HEADER', 'BODY_TEXT', 'TABLE_COLS', 'TABLE_ROW', 'FOOTER']),
  indentation: z.number().optional(),
  y: z.number().optional(),
  layer: z.number().optional(), // Represents hierarchy level (0 = root, 1 = sub-row, etc.)
  text: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  boundingBoxes: z.record(z.string(), BoundingBoxCellSchema).optional(), // Keyed by "cell_0", "cell_1", etc.
  cells: z.array(z.string()).optional(), // Extracted cell values array
  parentId: z.string().optional(), // Points to parent row for nested sub-lines
});

// The top-level document is a dynamic array of these components
export const OcrDocumentResponseSchema = z.array(OcrComponentSchema);
