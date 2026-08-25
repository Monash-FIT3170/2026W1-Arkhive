export interface ExtractedData {
  columns: string[];
  rows: ExtractedRow[];
}

export interface ExtractedRow {
  _id: string | number;
  _cellKeyMap?: Record<string, string>;
  _confidence?: number;
  _cellConfidence: Record<string, number>;
  _indentLevel?: number;
  [key: string]: any;
}

export interface ExtractedPage extends ExtractedData {
  pageIndex: number;
}
