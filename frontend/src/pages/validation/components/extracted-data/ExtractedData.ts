export interface ExtractedData {
    columns: string[];
    rows: ExtractedRow[];
}

<<<<<<< HEAD
export interface ExtractedRow {
    _id: string | number;
    _cellKeyMap?: Record<string, string>;
    [key: string]: any;
=======
export interface ExtractedRow { 
    _id: string | number;
    confidence: number; // OCR confidence score from Google Cloud Vision (0 to 1)
    [key: string]: any; 
>>>>>>> 35a60c904bc91d8edb2b3eb12faf23f0c816b4d5
}