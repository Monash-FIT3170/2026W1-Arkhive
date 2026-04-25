export interface Vertex {
  x: number;
  y: number;
}

export interface OCRBoundingBox {
  text: string;
  vertices: Vertex[]
  confidence: number
}

export type OCRBoundingBoxes = Record<string, OCRBoundingBox>