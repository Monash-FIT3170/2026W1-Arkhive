import type { ExtractedPage } from './TableData';

export interface Message {
  role: 'user' | 'model';
  content: string;
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  intent?: Intent; // so MessageItem knows when to show Accept/Reject
  resolved?: boolean; // true after user accepts or rejects
};

export interface ChatRequest {
  // for API request
  messages: Message[];
  documentContext?: ExtractedPage;
}

/** Exactly what the server changed, so the UI can switch table / mark cells without re-deriving it from the intent. */
export interface AppliedEdits {
  tableIds: string[]; // tables that were edited (first one is what the UI should show)
  cells: Array<{ rowId: string | number; column: string }>;
  blockIds: string[]; // field / text blocks that were edited
}

export interface ChatResponse {
  response: string; // the AI's human readable reply
  intent: Intent | null;
  updatedContext?: ExtractedPage; // the whole page, with the edit applied
  applied?: AppliedEdits; // present only when something actually changed
}

export interface Intent {
  type:
    | 'correction'
    | 'context'
    | 'approval'
    | 'rejection'
    | 'unclear'
    | 'column_confirm'
    | 'column_correction'
    | 'column_delete'
    | 'bulk_update'
    | 'field_correction'; // key/value field or text block
  tableId?: string; // which table the action targets (omitted = active table)
  blockId?: string; // field_correction: id of the field / text block
  rowId?: string; // The unique ID of the row
  column?: string;
  oldValue?: string;
  newValue?: string;
  approved?: boolean; // for column_confirm intent
  note?: string;
  updates?: Array<{ from: string; to: string }>; // for column renames
  deletedColumns?: string[]; // for column deletes
  bulkUpdates?: Array<{ tableId?: string; rowId: string; column: string; newValue: string }>;
}

export interface ReviewField {
  tableId?: string; // table the flagged cell lives in (defaults to the page's active table)
  rowId: string | number;
  column: string;
  value: string;
  confidence: number;
  issueType?: 'confidence' | 'format';
}

export interface ReviewFieldRequest {
  field: ReviewField;
  documentContext: ExtractedPage;
}

export interface BulkReviewFieldRequest {
  tableId?: string;
  column: string;
  fields: ReviewField[]; // multiple flagged cells sharing this column
  formatRegex?: string; // the detected format for the column, if any
  documentContext: ExtractedPage;
}
