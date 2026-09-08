import { describe, test, expect } from "vitest";
import {
  normalizeColKey,
  getMidX,
  extractColumns,
  detectItemColumn,
  flatten
} from "./flattener";
import type { OCRComponent } from "../../../../models/OCRComponent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal OCRComponent for testing */
function makeComponent(
  overrides: Partial<OCRComponent> & { id: string }
): OCRComponent {
  return {
    type: "TABLE_ROW",
    indentation: 0,
    y: 0,
    layer: 0,
    text: "",
    confidence: 0.9,
    cells: [],
    boundingBoxes: {},
    ...overrides
  };
}

/** Build a bounding box entry with four corners from a simple x-range */
function makeBox(x1: number, x2: number, y1 = 0, y2 = 10) {
  return {
    text: "",
    confidence: 0.9,
    vertices: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 }
    ]
  };
}

// ---------------------------------------------------------------------------
// 1. normalizeColKey
// ---------------------------------------------------------------------------
describe("normalizeColKey", () => {
  test("converts lowercase to uppercase", () => {
    expect(normalizeColKey("price")).toBe("PRICE");
  });

  test("replaces spaces with underscores", () => {
    expect(normalizeColKey("unit price")).toBe("UNIT_PRICE");
  });

  test("collapses multiple spaces into one underscore", () => {
    expect(normalizeColKey("unit   price")).toBe("UNIT_PRICE");
  });

  test("strips parenthetical suffixes", () => {
    expect(normalizeColKey("Price (IDR)")).toBe("PRICE");
  });

  test("removes trailing dots", () => {
    expect(normalizeColKey("No.")).toBe("NO");
  });

  test("handles already-normalised input", () => {
    expect(normalizeColKey("ITEM")).toBe("ITEM");
  });

  test("trims leading and trailing whitespace", () => {
    expect(normalizeColKey("  qty  ")).toBe("QTY");
  });

  test("returns empty string for empty input", () => {
    expect(normalizeColKey("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 2. getMidX
// ---------------------------------------------------------------------------
describe("getMidX", () => {
  test("returns the horizontal midpoint of a bounding box", () => {
    const comp = makeComponent({
      id: "comp_1",
      boundingBoxes: { cell_0: makeBox(100, 200) }
    });

    expect(getMidX(comp, "cell_0")).toBe(150);
  });

  test("returns null when the key does not exist", () => {
    const comp = makeComponent({ id: "comp_1", boundingBoxes: {} });

    expect(getMidX(comp, "cell_0")).toBeNull();
  });

  test("returns null when boundingBoxes is undefined", () => {
    const comp = makeComponent({ id: "comp_1" });
    delete (comp as any).boundingBoxes;

    expect(getMidX(comp, "cell_0")).toBeNull();
  });

  test("handles non-symmetric boxes correctly", () => {
    const comp = makeComponent({
      id: "comp_1",
      boundingBoxes: { cell_0: makeBox(50, 130) }
    });

    expect(getMidX(comp, "cell_0")).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// 3. extractColumns
// ---------------------------------------------------------------------------
describe("extractColumns", () => {
  /** Build a TABLE_COLS component whose cells map to the given labels */
  function makeColComponent(labels: string[]): OCRComponent {
    const boundingBoxes: Record<string, any> = {};
    labels.forEach((label, i) => {
      boundingBoxes[`col_${i}`] = {
        ...makeBox(i * 100, i * 100 + 80),
        text: label
      };
    });

    return makeComponent({
      id: "comp_0",
      type: "TABLE_COLS",
      cells: labels,
      boundingBoxes
    });
  }

  test("returns normalised column keys", () => {
    const data = [makeColComponent(["Item", "Qty", "Price (IDR)"])];
    const { keys } = extractColumns(data);
    expect(keys).toEqual(["ITEM", "QTY", "PRICE"]);
  });

  test("returns one position per column", () => {
    const data = [makeColComponent(["Item", "Qty", "Price"])];
    const { positions } = extractColumns(data);
    expect(positions).toHaveLength(3);
  });

  test("positions are in ascending order for left-to-right columns", () => {
    const data = [makeColComponent(["Item", "Qty", "Price"])];
    const { positions } = extractColumns(data);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
  });

  test("returns empty arrays when no TABLE_COLS component exists", () => {
    const data = [makeComponent({ id: "comp_1", type: "TABLE_ROW" })];
    const { keys, positions } = extractColumns(data);
    expect(keys).toEqual([]);
    expect(positions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. detectItemColumn
// ---------------------------------------------------------------------------
describe("detectItemColumn", () => {
  test("returns the index of the column where most rows start", () => {
    // Three rows all starting near x=10 (col index 0, centred at 50)
    const colXs = [50, 150, 250];

    const rows = ["comp_1", "comp_2", "comp_3"].map((id) =>
      makeComponent({
        id,
        boundingBoxes: { cell_0: makeBox(10, 90) } // midX = 50 → col 0
      })
    );

    expect(detectItemColumn(rows, colXs)).toBe(0);
  });

  test("returns 0 when given an empty components array", () => {
    expect(detectItemColumn([], [50, 150, 250])).toBe(0);
  });
});

//TESTS FOR BUILD AND FLATTEN TREE TODO

// ---------------------------------------------------------------------------
// 7. flatten – integration (pure pipeline, no network)
// ---------------------------------------------------------------------------
describe("flatten", () => {
  /** Minimal but realistic OCR dataset: one TABLE_COLS + two TABLE_ROW entries */
  function makeSimpleDataset(): OCRComponent[] {
    const colComp = makeComponent({
      id: "comp_0",
      type: "TABLE_COLS",
      cells: ["Item", "Qty", "Price"],
      boundingBoxes: {
        col_0: { ...makeBox(10, 90), text: "Item" },
        col_1: { ...makeBox(110, 190), text: "Qty" },
        col_2: { ...makeBox(210, 290), text: "Price" }
      }
    });

    const row1 = makeComponent({
      id: "comp_1",
      type: "TABLE_ROW",
      cells: ["Apples", "10", "5000"],
      boundingBoxes: {
        col_0: { ...makeBox(10, 90), text: "Apples" },
        col_1: { ...makeBox(110, 190), text: "10" },
        col_2: { ...makeBox(210, 290), text: "5000" }
      }
    });

    const row2 = makeComponent({
      id: "comp_2",
      type: "TABLE_ROW",
      cells: ["Bananas", "5", "3000"],
      boundingBoxes: {
        col_0: { ...makeBox(10, 90), text: "Bananas" },
        col_1: { ...makeBox(110, 190), text: "5" },
        col_2: { ...makeBox(210, 290), text: "3000" }
      }
    });

    return [colComp, row1, row2];
  }

  test("returns an object with columns and rows arrays", () => {
    const result = flatten(makeSimpleDataset());
    expect(result).toHaveProperty("columns");
    expect(result).toHaveProperty("rows");
  });

  test("columns array contains normalised header names", () => {
    const result = flatten(makeSimpleDataset());
    expect(result.columns).toContain("ITEM");
    expect(result.columns).toContain("QTY");
    expect(result.columns).toContain("PRICE");
  });

  test("produces one row per TABLE_ROW component", () => {
    const result = flatten(makeSimpleDataset());
    expect(result.rows).toHaveLength(2);
  });

  test("each row has a _id field matching its source component id", () => {
    const result = flatten(makeSimpleDataset());
    const ids = result.rows.map((r: any) => r._id);
    expect(ids).toContain("comp_1");
    expect(ids).toContain("comp_2");
  });

  test("returns empty columns and rows for an empty input array", () => {
    const result = flatten([]);
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  test("ignores HEADER and BODY_TEXT components when building rows", () => {
    const dataset = makeSimpleDataset();
    dataset.push(
      makeComponent({
        id: "comp_header",
        type: "HEADER",
        cells: ["INVOICE"],
        boundingBoxes: { col_0: { ...makeBox(10, 90), text: "INVOICE" } }
      })
    );

    const result = flatten(dataset);

    // Still only 2 data rows — the HEADER must be ignored
    expect(result.rows).toHaveLength(2);
  });
});