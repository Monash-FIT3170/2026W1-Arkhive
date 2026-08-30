import { describe, it, expect } from 'vitest';
import { OcrDocumentResponseSchema } from '../../../../models/ocrSchema';
import rawOcrSample from '../../../../mock-data/boundingBox.json';
// Acknowledgement: The development of these tests was done with the help of Google Gemini

describe('OCR JSON Schema Validation', () => {
  it('should validate dynamic length OCR response against contract', () => {
    // Safely parse so we can see the detailed error if it fails
    const result = OcrDocumentResponseSchema.safeParse(rawOcrSample);

    if (!result.success) {
      console.error(result.error);
    }

    // Asserts schema is completely valid without hardcoding length
    expect(result.success).toBe(true);
  });

  it('should correctly capture nested parent-child relationships in raw data', () => {
    const parsedData = OcrDocumentResponseSchema.parse(rawOcrSample);

    // Filter for child sub-lines (layer > 0)
    const childRows = parsedData.filter((item) => item.layer && item.layer > 0);

    // Assert all child rows have a valid parentId attached from the OCR payload
    childRows.forEach((child) => {
      expect(child.parentId).toBeDefined();
      expect(typeof child.parentId).toBe('string');
    });
  });
});

// describe('OCR Layout Hierarchy Transformation', () => {
//   it('should dynamically construct transformed rows with consistent structural keys', () => {
//     // Act: Pass raw flat OCR JSON into transformer function
//     const tableModel = flatten(rawOcrSample as any);

//     // 1. Assert column extraction works generically (at least 1 column is extracted)
//     expect(tableModel.columns).toBeDefined();
//     expect(tableModel.columns.length).toBeGreaterThan(0);

//     // 2. Assert rows dynamically map to the extracted columns
//     expect(tableModel.rows.length).toBeGreaterThan(0);

//     tableModel.rows.forEach((row) => {
//       // Every row should have an internal _id mapping to the original source component
//       expect(row._id).toBeDefined();

//       // Every row should have a value (even if empty string) for every declared column
//       tableModel.columns.forEach((colKey) => {
//         expect(row[colKey]).toBeDefined();
//         expect(typeof row[colKey]).toBe('string');
//       });
//     });
//   });

//   it('should appropriately assign varying depths into sub-level columns dynamically', () => {
//     const tableModel = flatten(rawOcrSample as any);

//     // Find columns that dynamically represent depth (like SUB_ITEM_1, SUB_ITEM_2) based on the dataset
//     const levelColumns = tableModel.columns.filter((col) => col.startsWith('SUB_'));

//     // If we have level columns generated due to depth, verify they are correctly attached structurally
//     if (levelColumns.length > 0) {
//       tableModel.rows.forEach((row) => {
//         levelColumns.forEach((subCol) => {
//           expect(row[subCol]).toBeDefined();
//         });
//       });
//     }
//   });
// });
