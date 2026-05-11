export interface ExtractedData {
    columns: string[];
    rows: ExtractedRow[];
}

export interface ExtractedRow {
    _id: string | number;
    confidence: number; // OCR confidence score from Google Cloud Vision (0 to 1)
    _cellKeyMap?: Record<string, string>;
    [key: string]: any;
}