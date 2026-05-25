import type { ExtractedData, ExtractedRow } from "../models/TableData";
import type { Intent } from "../models/Message";

//Apply intent function that takes in the extracted data and the intent, and returns the updated extracted data based on the intent type
export function applyIntent(data: ExtractedData, intent: Intent): ExtractedData {
    switch (intent.type) {
        case "correction":
            //console.log("correction intent fields:", intent.rowId, intent.column, intent.newValue);
            if (intent.rowId === undefined || intent.column === undefined || intent.newValue === undefined) {
                console.error("Missing required fields for correction intent");
                return data;
            }
            return updatecell(data, intent);

        case "column_correction":
            if (intent.oldValue === undefined || intent.newValue === undefined) {
                console.error("Missing required fields for column correction intent");
                return data;
            }
            return updateColumn(data, intent);
        case "column_delete":
            if (intent.column === undefined) {
                console.error("Missing required field for column delete intent");
                return data;
            }
            return deletecolumn(data, intent);
        case "column_confirm":
            if (intent.approved === undefined) {
                console.error("Missing required field for column confirmation intent");
                return data;
            }
            return confirmcolumns(data, intent.approved);
        default:
            return data;
    };

}

//Helper functions for each intent type
// For cell updates, we need to find the specific row and column and update the value
function updatecell(data: ExtractedData, intent: Intent): ExtractedData {
    const rowID = intent.rowId;
    const column = intent.column as string;
    const newValue = intent.newValue;
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
function updateColumn(data: ExtractedData, intent: Intent): ExtractedData {
    const oldColumn = intent.oldValue as string;
    const newColumn = intent.newValue as string;
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
function deletecolumn(data: ExtractedData, intent: Intent): ExtractedData {
    const column = intent.column as string;
    return {
        columns: data.columns.filter((col) => col !== column),
        rows: data.rows.map((row) => {
            if (column in row) {
                const { [column]: _, ...rest } = row;
                return rest as ExtractedRow;
            }
            return row;
        })
    };
}

// For column confirmation, we can simply return the data as is, since this intent is just for user confirmation and doesn't change the data structure
function confirmcolumns(data: ExtractedData, approved: boolean): ExtractedData {
    if (approved) {
        console.log("User confirmed the columns are correct");
    } else {
        console.log("User indicated the columns are incorrect");
    }
    return data;
}