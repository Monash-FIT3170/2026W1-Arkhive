import type { ExtractedData, ExtractedRow } from "./ExtractedData";
import type { OCRComponent } from "./OCRComponent";

 // main item (first cell is number)
 function isMainItem(component: any) { 
    return component.cells && /^\d+$/.test(component.cells[0]); 
}
    

 // text formatter (remove dashes, colons)
 function cleanItem(value: string) {
    return value.replace(/^[-\s]+/, "") .replace(/^[A-Z]\.\s*/, "") .replace(/:$/, "") .trim(); 
}

// price formatter (remove commas)
function cleanPrice(value: string, useFirstPrice = false) { 
    const matches = value.match(/\d{1,3}(?:,\d{3})+/g); //json has different format pricing

    if (!matches) return "";

    // if main item, use the first price, else use last price
    const price = useFirstPrice ? matches[0] : matches[matches.length - 1]; 

    return price.replace(/,/g, "");

}

//submodel formatter 
function isSubModel(value: string) { 
    return /^[A-Z]\.\s*[A-Z0-9]/.test(value.trim());
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
    const columns = [
        "ITEM_Level_1",
        "ITEM_Level_2",
        "ITEM_Level_3",
        "ITEM",
        "DESCRIPTION",
        "PRICE",
    ];

    const rows: ExtractedRow[] = [];
    const componentById = new Map<string, OCRComponent>();

    data.forEach((component) => { 
        componentById.set(component.id, component); // map components by id
    });

    data.forEach((component) => {

        // state for items indentation
        let currentLevel1 = ""; 
        let currentLevel2 = ""; 
        let currentLevel3 = "";


        //components that dont contain data
        if (!component.cells) return; 
        if (component.type === "HEADER" || component.type === "BODY_TEXT") return;
        if (component.text?.includes("NO . ITEM DESCRIPTION")) return;

        const firstCell = component.cells[0] || "";

        // Main item
        if (isMainItem(component)) {
            currentLevel1 = component.cells[1] || ""; 
            currentLevel2 = ""; 
            currentLevel3 = ""; 
        }

        // Submodel
        else if (isSubModel(firstCell)) { 
            currentLevel2 = firstCell.trim(); 
            currentLevel3 = ""; 
        }

        // Parts
        else { 
            currentLevel3 = cleanItem(firstCell);
         }
         
        // create rows
        const row: ExtractedRow = { 
            _id: component.id, 
        };

        // assign levels to row
        row["ITEM_Level_1"] = currentLevel1; 
        row["ITEM_Level_2"] = currentLevel2; 
        row["ITEM_Level_3"] = currentLevel3;

        //ITEM fix
        const rawItem = component.cells[0] || "";
        
        if (isMainItem(component)) { 
            row["ITEM"] = component.cells[1] || "";  //if main use cell 1
        } else if (looksLikeItemCode(rawItem)) {  
            row["ITEM"] = cleanItem(rawItem);  // item code use cell 2
        } else { 
            row["ITEM"] = "";  // blank
        }

        //DESCRIPTION
        row["DESCRIPTION"] = getDescription(component.cells);


        //PRICE fix - if main item, use first price, else use last price 
        const rawPriceText = component.cells.join(" ");
        row["PRICE"] = cleanPrice(rawPriceText, isMainItem(component));

        rows.push(row);
    });

    return { 
        columns, 
        rows, 
    };

}