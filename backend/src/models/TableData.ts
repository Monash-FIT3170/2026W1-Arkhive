export interface ExtractedData {
  columns: string[];
  rows: ExtractedRow[];
  itemColumnKey: string;
}

export interface ExtractedRow {
  _id: string | number;
  _cellKeyMap?: Record<string, string>;
  _confidence?: number;
  _cellConfidence: Record<string, number>;
  _indentLevel?: number;
  [key: string]: any;
}

/** A key/value block (invoice number, date, total...) flattened for the editor. */
export interface ExtractedField {
  id: string; // FieldBlock.id, also the overlay id on the document
  key: string;
  label: string;
  value: string;
  confidence: number;
}

/** A text block (title, heading, paragraph, footer) flattened for the editor. */
export interface ExtractedText {
  id: string; // TextBlock.id, also the overlay id on the document
  role: 'title' | 'heading' | 'paragraph' | 'footer';
  text: string;
  confidence: number;
}

/** A table that is on the page but not currently loaded into the top-level grid. */
export interface ExtractedTableSnapshot extends ExtractedData {
  tableId: string;
}

/** Tab metadata for the table switcher. */
export interface TableTab {
  id: string;
  label: string;
  rowCount: number;
}

/**
 * One page of the validation editor.
 *
 * `columns` / `rows` / `itemColumnKey` always hold the ACTIVE table (`tableId`),
 * so every hook that edits "the current grid" keeps working unchanged. Any other
 * tables on the page are parked in `otherTables` and swapped in with
 * `switchActiveTable()` (see utils/flattener.ts).
 */
export interface ExtractedPage extends ExtractedData {
  pageIndex: number;
  tableId?: string; // id of the TableBlock currently loaded in columns/rows
  tableOrder?: string[]; // all table ids on the page, in document order
  otherTables?: ExtractedTableSnapshot[];
  fields?: ExtractedField[];
  texts?: ExtractedText[];
}
