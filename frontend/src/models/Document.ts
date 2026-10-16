/**
 * Canonical intermediate representation (IR).
 * Everything downstream (API, UI, export) depends on this, never on Azure/Gemini shapes.
 * To support a new kind of content: add a Block variant here + an extractor + a UI renderer.
 */
export interface Vertex {
  x: number;
  y: number;
}
export interface Region {
  page: number;
  polygon: Vertex[];
}

export type DocType = 'table' | 'receipt' | 'invoice' | 'generic';

interface BlockBase {
  id: string;
  region?: Region; // where it is on the page (for highlight / click-to-source)
  confidence: number; // 0..1
}

export interface Cell {
  text: string;
  region?: Region;
  confidence: number;
}
export interface Column {
  key: string;
  label: string;
  inferred?: boolean;
}

export interface TableRow {
  id: string;
  level: number; // nesting depth, 0 = top
  parentId?: string;
  cells: Record<string, Cell>; // sparse, keyed by Column.key -> no dense-array/shifting problem
  confidence: number;
}

export interface TableBlock extends BlockBase {
  kind: 'table';
  columns: Column[]; // always non-empty; inferred:true when no header was found
  itemColumnKey: string; // column that carries the hierarchy / description
  rows: TableRow[];
}

export interface FieldBlock extends BlockBase {
  kind: 'field'; // key/value: invoice number, date, total, vendor...
  key: string;
  label: string;
  value: string;
}

export interface TextBlock extends BlockBase {
  kind: 'text';
  role: 'title' | 'heading' | 'paragraph' | 'footer';
  text: string;
}

export type Block = TableBlock | FieldBlock | TextBlock;
export type BlockOf<K extends Block['kind']> = Extract<Block, { kind: K }>;

export interface StructuredPage {
  pageIndex: number;
  blocks: Block[];
}
export interface StructuredDocument {
  docType: DocType;
  docTypeConfidence: number;
  pages: StructuredPage[];
}
