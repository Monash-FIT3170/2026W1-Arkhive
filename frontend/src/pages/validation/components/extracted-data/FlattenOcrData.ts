import type { ExtractedData, ExtractedRow } from "./ExtractedData";
import type { OCRComponent } from "./OCRComponent";

// --- Helpers ---

export function normalizeColKey(col: string): string {
	return col
		.replace(/\(.*?\)/g, "")
		.replace(/\./g, "")
		.replace(/\s+/g, "_")
		.trim()
		.toUpperCase();
}

export function cellMidX(component: OCRComponent, key: string): number | null {
	const verts = component.boundingBoxes?.[key]?.vertices;
	if (!verts?.length) return null;
	const xs = verts.map((v) => Number(v.x));
	return (Math.min(...xs) + Math.max(...xs)) / 2;
}

export function extractColumns(data: OCRComponent[]) {
	const colComp = data.find((c) => c.type === "TABLE_COLS");
	const rawCols = colComp?.cells ?? [];

	const keys = rawCols.map(normalizeColKey);

	const positions = rawCols.map(
		(_, i) => (colComp ? cellMidX(colComp, `cell_${i}`) : null) ?? i * 100
	);

	return { keys, positions };
}

export function detectItemColumn(
	components: OCRComponent[],
	colXs: number[]
): number {
	// This function returns the main column based on its frequency of items in that column, left based
	const freq = new Map<number, number>();
	components.forEach((c) => {
		// Get the horizontal center (x position) of the first item in this row
		const x = cellMidX(c, "cell_0");
		if (x === null) return;

		// Find the closest column to this component
		let bestIdx = 0;
		let minScore = Infinity;
		for (let j = 0; j < colXs.length; j++) {
			// Distance between component and column center
			const score = Math.abs(x - colXs[j]);
			// Keep track of the closest column
			if (score < minScore) {
				minScore = score;
				bestIdx = j;
			}
		}
		// Increment count for the column this component belongs to
		freq.set(bestIdx, (freq.get(bestIdx) ?? 0) + 1);
	});

	if (freq.size === 0) return 0;
	// Find the column with the highest number of assigned components
	return [...freq.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

export function resolveLevels(components: OCRComponent[]) {
	const idToDepth = new Map<string, number>(); // map os component id -> depth level
	const stack: { id: string; indent: number; depth: number }[] = []; // top of stack is the current parent
	const INDENT_THRESHOLD = 8;

	components.forEach((c) => {
		const verts = c.boundingBoxes?.["cell_0"]?.vertices;

		// get indent based on left mst x in bounding box/component indentation
		const currentIndent = verts?.length
			? Math.min(...verts.map((v) => Number(v.x)))
			: (c.indentation ?? 0);

		// first item
		if (stack.length === 0) {
			stack.push({ id: c.id, indent: currentIndent, depth: 0 });
			idToDepth.set(c.id, 0);
		} else {
			while (stack.length > 0) {
				// compare with previous item, difference of indentaiton
				const top = stack[stack.length - 1];
				const diff = currentIndent - top.indent;

				// if the difference is greater then the threshold
				if (diff > INDENT_THRESHOLD) {
					// give this component a greater depth
					const newDepth = top.depth + 1;
					stack.push({
						id: c.id,
						indent: currentIndent,
						depth: newDepth
					});
					// set this item new depth
					idToDepth.set(c.id, newDepth);
					break;

					// is the difference is less the the threshold, it means it is the same depth
				} else if (Math.abs(diff) <= INDENT_THRESHOLD) {
					// places this component at top of stack
					stack[stack.length - 1] = {
						id: c.id,
						indent: currentIndent,
						depth: top.depth
					};
					// set as same depth
					idToDepth.set(c.id, top.depth);
					break;

					// this means the component has a lower depth level
				} else {
					stack.pop(); // keep poping until we find a matching parent
				}
			}
			// when everything is popped, set back to root level
			if (stack.length === 0) {
				stack.push({ id: c.id, indent: currentIndent, depth: 0 });
				idToDepth.set(c.id, 0);
			}
		}
	});

	// return the component mapping to depth level
	return idToDepth;
}

// --- Level resolution ---
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
	// create the column headers for the nested main columns based on the maximum depth
	const maxDepth = Math.max(...idToDepth.values(), 0);
	const levelCols = Array.from(
		{ length: maxDepth },
		(_, i) => `SUB_ITEM_${i + 1}`
	);

	const rows: ExtractedRow[] = [];
	const levelCtx: string[] = [];

	// Setup context to remember columns to the left of ITEM (like NO.)
	const leftColsCtx: Record<string, string[]> = {};
	for (let i = 0; i < itemCol; i++) {
		leftColsCtx[colKeys[i]] = [];
	}

	components.forEach((c) => {
		// get depth for the component
		const depth = idToDepth.get(c.id) ?? 0;
		// map each cell to a column
		const mappedCells: { val: string; colIdx: number }[] = [];
		let lastColIdx = -1;

		(c.cells ?? []).forEach((val, i) => {
			// for each cell map it to the best column based on bounding boxes
			const mX = cellMidX(c, `cell_${i}`) ?? 0;

			// search for the next column only
			let bestIdx = lastColIdx + 1;
			if (bestIdx >= colXs.length) bestIdx = colXs.length - 1; //make sure id doesn't exceed max

			let minScore = Infinity;
			// only check cloest column forward from the last since cell in the same component can't go backwards from the previous
			for (let j = lastColIdx + 1; j < colXs.length; j++) {
				const score = Math.abs(mX - colXs[j]);
				if (score < minScore) {
					minScore = score;
					bestIdx = j;
				}
			}
			// push the cell with its column index into the map
			mappedCells.push({ val, colIdx: bestIdx });
			// use the
			lastColIdx = bestIdx;
		});

		// 1. Cascade logic for left-side columns
		for (let i = 0; i < itemCol; i++) {
			// get the column header
			const colKey = colKeys[i];
			// get the cells that have a column index equal to the current o
			const cell = mappedCells.find((mc) => mc.colIdx === i);

			if (cell) {
				leftColsCtx[colKey][depth] = cell.val; // Store new NO.
			} else if (depth > 0) {
				leftColsCtx[colKey][depth] =
					leftColsCtx[colKey][depth - 1] ?? ""; // Inherit parent NO.
			} else {
				leftColsCtx[colKey][depth] = ""; // Clear if empty top-level
			}
			leftColsCtx[colKey].length = depth + 1; // Wipe deeper history
		}

		// 2. Cascade logic for the "ITEM" column
		let itemValue = "";
		mappedCells.forEach((cell) => {
			if (cell.colIdx === itemCol && !itemValue) itemValue = cell.val;
		});

		levelCtx[depth] = itemValue;
		levelCtx.length = depth + 1;

		// 3. Construct the row
		const row: ExtractedRow = { _id: c.id };
		[...colKeys, ...levelCols].forEach((col) => (row[col] = ""));

		// Fill normal data (Description, Price)
		mappedCells.forEach(({ val, colIdx }) => {
			if (colIdx !== itemCol && colIdx >= itemCol && colKeys[colIdx]) {
				row[colKeys[colIdx]] = val;
			}
		});

		// Fill Cascading Left Columns (NO.)
		for (let i = 0; i < itemCol; i++) {
			const colKey = colKeys[i];
			if (colKey) row[colKey] = leftColsCtx[colKey][depth] ?? "";
		}

		// Fill ITEM and SUB_ITEMs
		const itemColKey = colKeys[itemCol];
		if (itemColKey) row[itemColKey] = levelCtx[0] ?? "";

		levelCols.forEach((col, i) => {
			row[col] = levelCtx[i + 1] ?? "";
		});

		rows.push(row);
	});

	return { rows, levelCols };
}

// --- Main ---
export function flattenOcrData(data: OCRComponent[]): ExtractedData {
	const components = data.filter(
		(c) =>
			c.cells && !["HEADER", "BODY_TEXT", "TABLE_COLS"].includes(c.type)
	);

	// get the mid positions and names of the columns in the table
	const { keys, positions } = extractColumns(data);
	// get the column that is considered the main column based on frequency of entries
	const itemCol = detectItemColumn(components, positions);
	// get component's depth/indentation level based on bounding boxes
	const idToDepth = resolveLevels(components);

	// build the rows and columns
	const { rows, levelCols } = buildRows({
		components,
		colKeys: keys,
		colXs: positions,
		itemCol,
		idToDepth
	});

	const finalCols: string[] = [];
	keys.forEach((k, i) => {
		finalCols.push(k);
		if (i === itemCol) finalCols.push(...levelCols);
	});

	return { columns: finalCols, rows };
}
