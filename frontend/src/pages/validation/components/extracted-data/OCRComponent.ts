export interface OCRComponent { 
    id: string; 
    type: 'TITLE' | 'HEADER' | 'TABLE_ROW' | 'LIST_ITEM' | 'BODY_TEXT'; 
    indentation: number; 
    y: number; 
    layer: number; 
    parentId?: string; 
    text: string; 
    cells?: string[]; 
    confidence: number; 
}