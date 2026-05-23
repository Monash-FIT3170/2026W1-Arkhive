export interface ExtractedData {
  columns: string[];
  rows: ExtractedRow[];
}

export interface ExtractedRow {
  _id: string | number;
  _cellKeyMap?: Record<string, string>;
  _confidence?: number;
  [key: string]: any;
}
