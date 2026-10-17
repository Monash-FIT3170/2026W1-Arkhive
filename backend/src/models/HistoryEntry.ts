export interface HistoryEntry {
  id: string;
  type: 'edit' | 'accept' | 'skip' | 'undo' | 'redo' | 'ai_edit';
  timestamp: string;
  pageIndex?: number;
  fieldId?: string;
  column?: string;
  oldValue?: string;
  newValue?: string;
  description: string;
}
