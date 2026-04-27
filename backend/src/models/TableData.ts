export interface ExtractedData {
	columns: string[];
	rows: ExtractedRow[];
}

export interface ExtractedRow {
	_id: string | number;
	[key: string]: any;
}
