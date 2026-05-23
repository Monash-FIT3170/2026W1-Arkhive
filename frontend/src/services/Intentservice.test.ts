import { describe, test, expect } from "vitest";
import { applyIntent } from "./intentService";
import type { ExtractedData } from "../models/TableData";
import type { Intent } from "../models/Message";

// ---------------------------------------------------------------------------
// Shared fixture – a small two-row table used across all test groups
// ---------------------------------------------------------------------------
const baseData: ExtractedData = {
  columns: ["ITEM", "QTY", "PRICE"],
  rows: [
    { _id: "comp_1", confidence: 0.95, ITEM: "Apples", QTY: "10", PRICE: "5000" },
    { _id: "comp_2", confidence: 0.80, ITEM: "Bananas", QTY: "5", PRICE: "3000" }
  ]
};

// Return a deep clone so each test starts with clean data
function cloneData(): ExtractedData {
  return JSON.parse(JSON.stringify(baseData));
}

// ---------------------------------------------------------------------------
// 1. "correction" intent – updating a single cell value
// ---------------------------------------------------------------------------
describe("applyIntent – correction", () => {

  test("updates the correct cell when all fields are provided", () => {
    const intent: Intent = {
      type: "correction",
      rowId: "comp_1",
      column: "ITEM",
      newValue: "Mangoes"
    };

    const result = applyIntent(cloneData(), intent);

    // Only the targeted cell should change
    expect(result.rows[0].ITEM).toBe("Mangoes");
    // Other cells in the same row must be untouched
    expect(result.rows[0].QTY).toBe("10");
    // Other rows must be untouched
    expect(result.rows[1].ITEM).toBe("Bananas");
  });

  test("returns data unchanged when rowId is missing", () => {
    const intent: Intent = {
      type: "correction",
      column: "ITEM",
      newValue: "Mangoes"
      // rowId intentionally omitted
    } as Intent;

    const data = cloneData();
    const result = applyIntent(data, intent);

    expect(result).toEqual(data);
  });

  test("returns data unchanged when column is missing", () => {
    const intent: Intent = {
      type: "correction",
      rowId: "comp_1",
      newValue: "Mangoes"
      // column intentionally omitted
    } as Intent;

    const data = cloneData();
    const result = applyIntent(data, intent);

    expect(result).toEqual(data);
  });

  test("returns data unchanged when newValue is missing", () => {
    const intent: Intent = {
      type: "correction",
      rowId: "comp_1",
      column: "ITEM"
      // newValue intentionally omitted
    } as Intent;

    const data = cloneData();
    const result = applyIntent(data, intent);

    expect(result).toEqual(data);
  });

  test("does not mutate the original data object", () => {
    const data = cloneData();
    const original = JSON.stringify(data);

    applyIntent(data, {
      type: "correction",
      rowId: "comp_1",
      column: "ITEM",
      newValue: "Mangoes"
    });

    expect(JSON.stringify(data)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// 2. "column_correction" intent – renaming a column header
// ---------------------------------------------------------------------------
describe("applyIntent – column_correction", () => {

  test("renames the column in the columns array", () => {
    const intent: Intent = {
      type: "column_correction",
      oldValue: "PRICE",
      newValue: "UNIT_PRICE"
    };

    const result = applyIntent(cloneData(), intent);

    expect(result.columns).toContain("UNIT_PRICE");
    expect(result.columns).not.toContain("PRICE");
  });

  test("renames the column key in every row", () => {
    const intent: Intent = {
      type: "column_correction",
      oldValue: "PRICE",
      newValue: "UNIT_PRICE"
    };

    const result = applyIntent(cloneData(), intent);

    result.rows.forEach((row) => {
      expect("UNIT_PRICE" in row).toBe(true);
      expect("PRICE" in row).toBe(false);
    });
  });

  test("preserves the original cell values after renaming", () => {
    const intent: Intent = {
      type: "column_correction",
      oldValue: "PRICE",
      newValue: "UNIT_PRICE"
    };

    const result = applyIntent(cloneData(), intent);

    expect(result.rows[0].UNIT_PRICE).toBe("5000");
    expect(result.rows[1].UNIT_PRICE).toBe("3000");
  });

  test("leaves unrelated columns and rows untouched", () => {
    const intent: Intent = {
      type: "column_correction",
      oldValue: "QTY",
      newValue: "QUANTITY"
    };

    const result = applyIntent(cloneData(), intent);

    expect(result.columns).toContain("ITEM");
    expect(result.columns).toContain("PRICE");
    expect(result.rows[0].ITEM).toBe("Apples");
  });
});

// ---------------------------------------------------------------------------
// 3. "column_delete" intent – removing a column entirely
// ---------------------------------------------------------------------------
describe("applyIntent – column_delete", () => {

  test("removes the column from the columns array", () => {
    const intent: Intent = {
      type: "column_delete",
      column: "QTY"
    };

    const result = applyIntent(cloneData(), intent);

    expect(result.columns).not.toContain("QTY");
    // Other columns stay
    expect(result.columns).toContain("ITEM");
    expect(result.columns).toContain("PRICE");
  });

  test("removes the column key from every row", () => {
    const intent: Intent = {
      type: "column_delete",
      column: "QTY"
    };

    const result = applyIntent(cloneData(), intent);

    result.rows.forEach((row) => {
      expect("QTY" in row).toBe(false);
    });
  });

  test("returns data unchanged when column field is missing", () => {
    const intent: Intent = {
      type: "column_delete"
      // column intentionally omitted
    } as Intent;

    const data = cloneData();
    const result = applyIntent(data, intent);

    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// 4. "column_confirm" intent – user approves or rejects columns
// ---------------------------------------------------------------------------
describe("applyIntent – column_confirm", () => {

  test("returns data unchanged when approved is true", () => {
    const data = cloneData();
    const result = applyIntent(data, { type: "column_confirm", approved: true });

    expect(result).toEqual(data);
  });

  test("returns data unchanged when approved is false", () => {
    const data = cloneData();
    const result = applyIntent(data, { type: "column_confirm", approved: false });

    expect(result).toEqual(data);
  });

  test("returns data unchanged when approved field is missing", () => {
    const data = cloneData();
    const result = applyIntent(data, { type: "column_confirm" } as Intent);

    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// 5. Unrecognised / fallback intent types
// ---------------------------------------------------------------------------
describe("applyIntent – unrecognised intent types", () => {

  test("returns data unchanged for 'context' type", () => {
    const data = cloneData();
    const result = applyIntent(data, { type: "context" } as Intent);
    expect(result).toEqual(data);
  });

  test("returns data unchanged for 'approval' type", () => {
    const data = cloneData();
    const result = applyIntent(data, { type: "approval" } as Intent);
    expect(result).toEqual(data);
  });

  test("returns data unchanged for 'rejection' type", () => {
    const data = cloneData();
    const result = applyIntent(data, { type: "rejection" } as Intent);
    expect(result).toEqual(data);
  });
});