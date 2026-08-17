import { ExtractedData } from './TableData';

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
  documentContext?: ExtractedData;
}

export interface ChatResponse {
  response: string; // the AI's human readable reply
  intent: Intent | null;
  updatedContext?: ExtractedData; // AI returns the modified table data
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
    | 'bulk_update';
  rowId?: string; // The unique ID of the row
  column?: string; // <-- Changed from 'field' to 'column'
  oldValue?: string;
  newValue?: string;
  note?: string;
  updates?: Array<{ from: string; to: string }>; // for column renames
  deletedColumns?: string[]; // for column deletes
  bulkUpdates?: Array<{ rowId: string; column: string; newValue: string }>; // for bulk updates
}

export interface ReviewField {
  rowId: string | number;
  column: string;
  value: string;
  confidence: number;
  issueType?: 'confidence' | 'format';
}

export interface ReviewFieldRequest {
  field: ReviewField;
  documentContext: ExtractedData;
}

export interface BulkReviewFieldRequest {
  column: string;
  fields: ReviewField[]; // multiple flagged cells sharing this column
  formatRegex?: string; // the detected format for the column, if any
  documentContext: ExtractedData;
}
