import type { ExtractedData } from "../models/TableData";
import type { Intent } from "../models/Message";

export function applyIntent(data: ExtractedData, intent: Intent): ExtractedData {

}

function updatecell(data: ExtractedData, row: number, column: string, newValue: string): ExtractedData { }
function updatecolumn(data: ExtractedData, oldColumn: string, newColumn: string): ExtractedData { }
function deletecolumn(data: ExtractedData, column: string): ExtractedData { }
function confirmcolumns(data: ExtractedData, approved: boolean): ExtractedData { }
