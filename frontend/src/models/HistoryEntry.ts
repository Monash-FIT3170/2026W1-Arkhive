export interface HistoryEntry { 
  id: string; 
  type: 'edit' | 'accept' | 'skip' | 'undo' | 'redo'; 
  timestamp: string; 
  pageIndex?: number; 
  fieldId?: string; 
  column?: string; 
  oldValue?: string; 
  newValue?: string;
   description: string;
  }