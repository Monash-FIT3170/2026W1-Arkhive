import type { ExtractedData, ExtractedRow } from "../../../../models/TableData";
import type { OCRComponent } from "../../../../models/OCRComponent";

export function normalizeColKey(col: string): string {
	return col
		.replace(/\(.*?\)/g, "")
		.replace(/\./g, "")
		.replace(/\s+/g, "_")
		.trim()
		.toUpperCase();
}

/** Finds the horizontal center (X coordinate) of a specific cell in a component */
export function cellMidX(component: OCRComponent, key: string): number | null {
	const verts = component.boundingBoxes?.[key]?.vertices;
	if (!verts?.length) return null;

	const xs = verts.map((v) => Number(v.x));
	return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Helper to find the index of the closest number in an array to a target value */
function findClosestIndex(
	target: number,
	values: number[],
	startIndex = 0
): number {
	let bestIdx = startIndex;
	let minScore = Infinity;

	for (let j = startIndex; j < values.length; j++) {
		const score = Math.abs(target - values[j]);
		if (score < minScore) {
			minScore = score;
			bestIdx = j;
		}
	}
	return bestIdx;
}

/** Extracts the column headers and their X-axis positions from the table */
export function extractColumns(data: OCRComponent[]) {
	const colComp = data.find((c) => c.type === "TABLE_COLS");
	const rawCols = colComp?.cells ?? [];

	const keys = rawCols.map(normalizeColKey);
	const positions = rawCols.map(
		(_, i) => (colComp ? cellMidX(colComp, `cell_${i}`) : null) ?? i * 100
	);

	return { keys, positions };
}

/** Determines which column is the main "Item" column based on where most row items start */
export function detectItemColumn(
	components: OCRComponent[],
	colXs: number[]
): number {
	const freq = new Map<number, number>();

	components.forEach((c) => {
		const startX = cellMidX(c, "cell_0");
		if (startX === null) return;

		const closestColIdx = findClosestIndex(startX, colXs);
		freq.set(closestColIdx, (freq.get(closestColIdx) ?? 0) + 1);
	});

	if (freq.size === 0) return 0;

	// Return the column index with the highest frequency of items
	return [...freq.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** Determines the nested depth (indentation level) of each row using a Stack */
export function resolveLevels(components: OCRComponent[]) {
	const idToDepth = new Map<string, number>();
	const stack: { id: string; indent: number; depth: number }[] = [];
	const INDENT_THRESHOLD = 8;

	for (const c of components) {
		const verts = c.boundingBoxes?.["cell_0"]?.vertices;
		const currentIndent = verts?.length
			? Math.min(...verts.map((v) => Number(v.x)))
			: (c.indentation ?? 0);
		let currentDepth = 0;

		// Pop items off the stack until we find the parent or sibling of the current item
		while (stack.length > 0) {
			const top = stack[stack.length - 1];
			const diff = currentIndent - top.indent;

			if (diff > INDENT_THRESHOLD) {
				// Current item is indented further than top (it's a Child)
				currentDepth = top.depth + 1;
				break;
			} else if (Math.abs(diff) <= INDENT_THRESHOLD) {
				// Current item has same indentation as top (it's a Sibling)
				currentDepth = top.depth;
				stack.pop(); // Remove old sibling so current becomes the new top
				break;
			} else {
				// Current item is outdented (it belongs to a previous level)
				stack.pop();
			}
		}

		stack.push({ id: c.id, indent: currentIndent, depth: currentDepth });
		idToDepth.set(c.id, currentDepth);
	}

	return idToDepth;
}

/** Maps a specific cell to its matching column index */
function resolveCellColIdx(
	component: OCRComponent,
	cellIndex: number,
	colKeys: string[],
	colXs: number[],
	lastColIdx: number
): number {
	const bbKey = `cell_${cellIndex}`;
	const rawColumnName = component.boundingBoxes?.[bbKey]?.column;

	// The OCR already knows exactly which column this cell belongs to
	if (rawColumnName) {
		const idx = colKeys.indexOf(normalizeColKey(rawColumnName));
		if (idx !== -1) return idx;
	}

	// If doesn't exist, then find the closest column spatially (forward-only matching)
	const mX = cellMidX(component, bbKey) ?? 0;
	const safeStartIndex = Math.min(lastColIdx + 1, colXs.length - 1);

	return findClosestIndex(mX, colXs, safeStartIndex);
}

type BuildRowsParams = {
	components: OCRComponent[];
	colKeys: string[];
	colXs: number[];
	itemCol: number;
	idToDepth: Map<string, number>;
};

export function buildRows({
	components,
	colKeys,
	colXs,
	itemCol,
	idToDepth
}: BuildRowsParams): { rows: ExtractedRow[]; levelCols: string[] } {
	const maxDepth = Math.max(...idToDepth.values(), 0);
	const subItemCols = Array.from(
		{ length: maxDepth },
		(_, i) => `SUB_${colKeys[itemCol]}_${i + 1}`
	);

	const rows: ExtractedRow[] = [];

	// Context trackers used to cascade parent values down to child rows
	const cascadingLeftValues: Record<string, string[]> = {};
	const hierarchyValues: string[] = [];

	// Initialize tracking for columns to the left of the main item (e.g., "NO.")
	for (let i = 0; i < itemCol; i++) {
		cascadingLeftValues[colKeys[i]] = [];
	}

	components.forEach((c) => {
		const depth = idToDepth.get(c.id) ?? 0;
		let lastColIdx = -1;

		// Map cells to their respective columns
		const mappedCells = (c.cells ?? []).map((val, i) => {
			const colIdx = resolveCellColIdx(c, i, colKeys, colXs, lastColIdx);
			lastColIdx = colIdx;
			return { val, colIdx };
		});

		// Update Cascading Left-Side Logic (e.g., inheriting parent row numbers)
		for (let i = 0; i < itemCol; i++) {
			const colKey = colKeys[i];
			const cellValue = mappedCells.find((mc) => mc.colIdx === i)?.val;

			if (cellValue) {
				cascadingLeftValues[colKey][depth] = cellValue;
			} else if (depth > 0) {
				cascadingLeftValues[colKey][depth] =
					cascadingLeftValues[colKey][depth - 1] ?? "";
			} else {
				cascadingLeftValues[colKey][depth] = "";
			}
			cascadingLeftValues[colKey].length = depth + 1; // Clear deeper history
		}

		// Update Hierarchy/Nesting Logic for the main item
		const itemValue =
			mappedCells.find((mc) => mc.colIdx === itemCol)?.val ?? "";
		hierarchyValues[depth] = itemValue;
		hierarchyValues.length = depth + 1;

		// Assemble the final Extracted Row
		const row: ExtractedRow = { _id: c.id };
		[...colKeys, ...subItemCols].forEach((col) => (row[col] = ""));

		// Fill normal data (Description, Price, etc.)
		mappedCells.forEach(({ val, colIdx }) => {
			if (colIdx >= itemCol && colIdx !== itemCol && colKeys[colIdx]) {
				row[colKeys[colIdx]] = val;
			}
		});

		// Fill Cascading Left Columns
		for (let i = 0; i < itemCol; i++) {
			if (colKeys[i])
				row[colKeys[i]] = cascadingLeftValues[colKeys[i]][depth] ?? "";
		}

		// Fill ITEM and SUB_ITEMs
		if (colKeys[itemCol]) row[colKeys[itemCol]] = hierarchyValues[0] ?? "";
		subItemCols.forEach((col, i) => {
			row[col] = hierarchyValues[i + 1] ?? "";
		});

		rows.push(row);
	});

	return { rows, levelCols: subItemCols };
}

export function flattenOcrData(data: OCRComponent[]): ExtractedData {
	const components = data.filter(
		(c) =>
			c.cells && !["HEADER", "BODY_TEXT", "TABLE_COLS"].includes(c.type)
	);

	const { keys, positions } = extractColumns(data);
	const itemCol = detectItemColumn(components, positions);
	const idToDepth = resolveLevels(components);

	const { rows, levelCols } = buildRows({
		components,
		colKeys: keys,
		colXs: positions,
		itemCol,
		idToDepth
	});

	// Build the final array of column names, injecting sub-items after the main item column
	const finalCols: string[] = [];
	keys.forEach((k, i) => {
		finalCols.push(k);
		if (i === itemCol) finalCols.push(...levelCols);
	});

<<<<<<< HEAD
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
<<<<<<< HEAD
        const row: ExtractedRow = {
            _id: component.id,
=======
        const row: ExtractedRow = { 
            _id: component.id,
            confidence: component.confidence ?? 1, // carry confidence from OCR component test
>>>>>>> 35a60c904bc91d8edb2b3eb12faf23f0c816b4d5
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
        const priceCol = cleanedCols[cleanedCols.length - 1] ?? "PRICE";
        row[priceCol] = cleanPrice(rawPriceText, isMainItem(component));

        rows.push(row);
    });

    return {
        columns,
        rows,
    };

}
=======
	return { columns: finalCols, rows };
}
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576
