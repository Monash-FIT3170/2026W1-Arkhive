import type { DocumentType, FieldMapping } from './fieldMapping';

/**
 * Starting mappings, one per document type.
 * The target names are placeholders until the team agrees the standard
 * columns for each type. Rules that match no column are skipped.
 */
export const FIELD_MAPPING_PRESETS: Record<DocumentType, FieldMapping> = {
  receipt: {
    documentType: 'receipt',
    rules: [
      { from: 'ITEM', to: 'Item' },
      { from: 'QTY', to: 'Quantity' },
      { from: 'PRICE', to: 'Unit Price' },
      { from: 'TOTAL', to: 'Amount' },
    ],
  },
  invoice: {
    documentType: 'invoice',
    rules: [
      { from: 'ITEM', to: 'Description' },
      { from: 'QTY', to: 'Quantity' },
      { from: 'PRICE', to: 'Unit Price' },
      { from: 'TOTAL', to: 'Amount' },
    ],
  },
  form: { documentType: 'form', rules: [] },
  record: { documentType: 'record', rules: [] },
};
