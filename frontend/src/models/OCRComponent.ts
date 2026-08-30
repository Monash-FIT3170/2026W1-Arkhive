export interface OCRBoundingBox {
  text: string;
  column?: string;
  vertices: Vertex[];
  confidence: number;
}

export interface Vertex {
  x: number;
  y: number;
}

export interface OCRBoundingBoxes {
  [key: string]: OCRBoundingBox;
}

export interface OCRComponent {
  id: string;
  type: 'TITLE' | 'HEADER' | 'TABLE_COLS' | 'TABLE_ROW' | 'LIST_ITEM' | 'BODY_TEXT';
  indentation: number;
  y: number;
  layer: number;
  parentId?: string;
  text: string;
  cells?: string[];
  confidence: number;
  boundingBoxes?: OCRBoundingBoxes;
}

export type Page = {
  page_num: number;
  components: OCRComponent[];
};

export type Pages = Page[];
