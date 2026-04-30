export interface Vertex {
  x: number;
  y: number;
}

export interface OCRBoundingBox {
  text: string;
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
}

export type OCRBoundingBoxes = Record<string, OCRBoundingBox>