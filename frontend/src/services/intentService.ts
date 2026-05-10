import type { ExtractedData, ExtractedRow } from "../models/TableData";
import type { Intent } from "../models/Message";

//Apply intent function that takes in the extracted data and the intent, and returns the updated extracted data based on the intent type
export function applyIntent(data: ExtractedData, intent: Intent): ExtractedData {
    switch (intent.type) {
        case "correction":
            return updatecell(data, intent.rowId, intent.column, intent.newValue);
        case "column_correction":
            return updateColumn(data, intent.oldValue, intent.newValue);
        case "column_delete":
            return deletecolumn(data, intent.column);
        case "column_confirm":
            return confirmcolumns(data, intent.approved);
        default:
            return data;
    };

}

//Helper functions for each intent type
// For cell updates, we need to find the specific row and column and update the value
function updatecell(data: ExtractedData, rowID: string, column: string, newValue: string): ExtractedData {
    return {
        ...data,
        rows: data.rows.map((row) => {
            if (row._id === rowID) {
                return {
                    ...row,
                    [column]: newValue
                }
            }
            return row;
        })
    };
}

// For column updates, we need to update both the columns array and the rows to reflect the new column name
function updateColumn(data: ExtractedData, oldColumn: string, newColumn: string): ExtractedData {
    return {
        columns: data.columns.map((col) => col === oldColumn ? newColumn : col),
        rows: data.rows.map((row) => {
            if (oldColumn in row) {
                const { [oldColumn]: oldValue, ...rest } = row;
                return { ...rest, [newColumn]: oldValue } as ExtractedRow;

            }
            return row;
        })
    };
}

// For column deletion, we need to remove the column from the columns array and also remove it from each row
function deletecolumn(data: ExtractedData, column: string): ExtractedData {
    return {
        columns: data.columns.filter((col) => col !== column),
        rows: data.rows.map((row) => {
            if (column in row) {
                const { [column]: string, ...rest } = row;
                return rest as ExtractedRow;
            }
            return row;
        })
    };
}

// For column confirmation, we can simply return the data as is, since this intent is just for user confirmation and doesn't change the data structure
function confirmcolumns(data: ExtractedData, approved: boolean): ExtractedData {
    return data;
}
