export interface Vertex {
  x: number;
  y: number;
}

export interface OCRBoundingBox {
  text: string;
  column?: string;
  vertices: Vertex[]
  confidence: number
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
  /** Groups pages that came from the same source file. */
  fileIndex?: number;
  /** Original file name shown in the validation file dropdown. */
  fileName?: string;
  /** Index of this page in the uploaded image list (`GET /upload/image/:index`). */
  pageIndex?: number;
  /** Human-readable page label within the source file, e.g. "Page 2". */
  pageLabel?: string;
}

export type OCRBoundingBoxes = Record<string, OCRBoundingBox>