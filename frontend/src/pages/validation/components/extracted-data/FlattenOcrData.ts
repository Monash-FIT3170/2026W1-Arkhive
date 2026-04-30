import type { ExtractedData, ExtractedRow } from "./ExtractedData";
import type { OCRComponent } from "./OCRComponent";

// main item (first cell is number)
function isMainItem(component: any) {
    return component.cells && /^\d+$/.test(component.cells[0]);
}

// helper for layering
function effectiveLayer(component: OCRComponent): number {
    return isMainItem(component) ? 0 : component.layer + 1;
}


// text formatter (remove dashes, colons)
function cleanItem(value: string) {
    return value.replace(/^[-\s]+/, "").replace(/^[A-Z]\.\s*/, "").replace(/:$/, "").trim();
}

// price formatter (remove commas)
function cleanPrice(value: string, useFirstPrice = false) {
    const matches = value.match(/\d{1,3}(?:,\d{3})+/g); //json has different format pricing

    if (!matches) return "";

    // if main item, use the first price, else use last price
    const price = useFirstPrice ? matches[0] : matches[matches.length - 1];

    return price.replace(/,/g, "");

}

//description formatter
function getDescription(cells: string[]) {
    if (cells.length <= 2) return "";
    return cells.slice(1, cells.length - 1).join(" ").trim();
}

// item code checker
function looksLikeItemCode(value: string) {
    return /^[A-Z0-9-]+(?:\s*\/\s*[A-Z0-9-]+)?\s*:?$/.test(value.trim());
}


// Flatten ocr data 
export function flattenOcrData(data: OCRComponent[]): ExtractedData {

    //find table header row
    const tableColsComponent = data.find((c) => c.type === "TABLE_COLS");

    //fallback
    const fallbackCols = tableColsComponent?.cells || ["ITEM", "DESCRIPTION", "PRICE",];

    //header clean
    const cleanedCols = fallbackCols.map((col) => col.replace(/\(.*?\)/g, "")
        .replace(/\./g, "")
        .replace(/\s+/g, "_")
        .trim()
        .toUpperCase()
    );

    //go through each component
    let maxLayer = 0; data.forEach((component) => {
        if (component.cells && component.layer > maxLayer) {
            maxLayer = component.layer;
        }
    });

    // +1 to account for the effective layer shift
    const adjustedMaxLayer = maxLayer + 1;

    //create level cols for hierarchy
    const levelColumns: string[] = [];

    for (let i = 1; i <= adjustedMaxLayer; i++) {
        levelColumns.push(`ITEM_Level_${i}`);
    }

    //build cols
    const columns: string[] = [];
    levelColumns.forEach((col) => columns.push(col));
    cleanedCols.forEach((col) => columns.push(col));

    //rows
    const rows: ExtractedRow[] = [];


    //dynamic layering array
    const currentLevels: string[] = [];

    data.forEach((component) => {

        //components that dont contain data
        if (!component.cells) return;
        if (component.type === "HEADER" || component.type === "BODY_TEXT") return;
        if (component.type === "TABLE_COLS") return;

        //for layers
        const layer = effectiveLayer(component);
        const firstCell = component.cells[0] || "";

        //array must be long enough
        while (currentLevels.length <= layer) {
            currentLevels.push("");
        }

        //update current level
        if (isMainItem(component)) {
            currentLevels[layer] = component.cells[1] || "";
        } else {
            currentLevels[layer] = cleanItem(firstCell);
        }

        for (let i = layer + 1; i < currentLevels.length; i++) {
            currentLevels[i] = "";
        }

        // create rows
        const row: ExtractedRow = {
            _id: component.id,
        };

        if (component.boundingBoxes) {
            const boundingKeys = Object.keys(component.boundingBoxes);
            row._cellKeyMap = {};
            cleanedCols.forEach((col, idx) => {
                if (idx < boundingKeys.length) {
                    row._cellKeyMap![col] = boundingKeys[idx];
                }
            });
        }

        // assign levels to row
        for (let i = 0; i < levelColumns.length; i++) {
            row[levelColumns[i]] = currentLevels[i] || "";
        }

        //ITEM fix
        const rawItem = component.cells[0] || "";
        const itemCol = cleanedCols.find((col) => col.includes("ITEM")) ?? "ITEM";


        if (isMainItem(component)) {
            row[itemCol] = component.cells[1] || "";
        } else if (looksLikeItemCode(rawItem)) {
            row[itemCol] = cleanItem(rawItem)  // item code use first cell
        } else {
            row[itemCol] = "";  // blank
        }

        //DESCRIPTION fix
        const descCol = cleanedCols.find((col) => col.includes("DESC")) ?? "DESCRIPTION";
        row[descCol] = getDescription(component.cells);


        //PRICE fix - find anything that includes "price"
        const rawPriceText = component.cells.join(" ");
        const priceCol = columns.find((col) => col.includes("PRICE")) || "PRICE";
        row[priceCol] = cleanPrice(rawPriceText, isMainItem(component));

        rows.push(row);
    });

    return {
        columns,
        rows,
    };

}