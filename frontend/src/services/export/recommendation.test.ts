import { describe, expect, it } from 'vitest';
import { recommendTemplate } from './recommendation';

describe('recommendTemplate', () => {
  it('recommends invoice templates when docType is explicitly "invoice"', () => {
    const res = recommendTemplate({ docType: 'invoice' });
    expect(res.category).toBe('invoice');
    expect(res.recommendedTemplateIds.has('csv.invoice')).toBe(true);
    expect(res.recommendedTemplateIds.has('xlsx.invoice')).toBe(true);
    expect(res.getRecommendedIdForFormat('csv')).toBe('csv.invoice');
    expect(res.getRecommendedIdForFormat('xlsx')).toBe('xlsx.invoice');
  });

  it('recommends receipt templates when docType is explicitly "receipt"', () => {
    const res = recommendTemplate({ docType: 'receipt' });
    expect(res.category).toBe('receipt');
    expect(res.recommendedTemplateIds.has('csv.receipt')).toBe(true);
    expect(res.recommendedTemplateIds.has('xlsx.receipt')).toBe(true);
    expect(res.getRecommendedIdForFormat('csv')).toBe('csv.receipt');
    expect(res.getRecommendedIdForFormat('xlsx')).toBe('xlsx.receipt');
  });

  it('heuristically detects invoices based on extracted fields and columns', () => {
    const res = recommendTemplate({
      extractedData: {
        columns: ['Description', 'Qty', 'Unit Price', 'Amount'],
        rows: [],
        itemColumnKey: 'Description',
        fields: [
          { id: '1', key: 'invoice_number', label: 'Invoice #', value: '1001', confidence: 0.9 },
          { id: '2', key: 'vendor', label: 'Vendor', value: 'Supplies Co', confidence: 0.9 },
          { id: '3', key: 'subtotal', label: 'Subtotal', value: '50.00', confidence: 0.9 },
        ],
      },
    });

    expect(res.category).toBe('invoice');
    expect(res.recommendedTemplateIds.has('csv.invoice')).toBe(true);
    expect(res.reason).toContain('invoice');
  });

  it('heuristically detects receipts based on merchant and transaction fields', () => {
    const res = recommendTemplate({
      extractedData: {
        columns: ['Item', 'Price', 'Qty'],
        rows: [],
        itemColumnKey: 'Item',
        fields: [
          { id: '1', key: 'merchant', label: 'Store', value: 'Retailer', confidence: 0.9 },
          { id: '2', key: 'receipt_no', label: 'Receipt #', value: '987', confidence: 0.9 },
          { id: '3', key: 'amount_paid', label: 'Paid', value: '15.00', confidence: 0.9 },
        ],
      },
    });

    expect(res.category).toBe('receipt');
    expect(res.recommendedTemplateIds.has('csv.receipt')).toBe(true);
    expect(res.reason).toContain('receipt');
  });

  it('falls back to default template for generic tables without invoice/receipt fields', () => {
    const res = recommendTemplate({
      extractedData: {
        columns: ['StudentID', 'Department', 'GPA'],
        rows: [],
        itemColumnKey: 'StudentID',
        fields: [],
      },
    });

    expect(res.category).toBe('default');
    expect(res.recommendedTemplateIds.has('csv.default')).toBe(true);
    expect(res.recommendedTemplateIds.has('xlsx.default')).toBe(true);
    expect(res.getRecommendedIdForFormat('csv')).toBe('csv.default');
  });

  it('accurately identifies receipts even if OCR extracted invoice_number when receipt text or fields exist', () => {
    const res = recommendTemplate({
      extractedData: {
        columns: ['Item', 'Qty', 'Total'],
        rows: [{ _id: '1', _cellConfidence: {}, Item: 'Coffee', Qty: '1', Total: '4.50' }],
        itemColumnKey: 'Item',
        fields: [
          { id: '1', key: 'invoice_number', label: 'Receipt #', value: '4481', confidence: 0.9 },
          { id: '2', key: 'vendor', label: 'Cafe Central', value: 'Cafe Central', confidence: 0.9 },
        ],
        texts: [
          { id: 't1', role: 'title', text: 'TAX RECEIPT', confidence: 0.99 },
          { id: 't2', role: 'footer', text: 'Thank you for your business! Terminal 01', confidence: 0.95 },
        ],
      },
    });

    expect(res.category).toBe('receipt');
    expect(res.recommendedTemplateIds.has('csv.receipt')).toBe(true);
    expect(res.reason).toBe('Detected receipt');
  });

  it('accurately identifies generic multi-row tables as tables', () => {
    const res = recommendTemplate({
      extractedData: {
        columns: ['Model', 'Year', 'Stock', 'Price'],
        rows: [
          { _id: '1', _cellConfidence: {}, Model: 'A', Year: '2020', Stock: '10', Price: '100' },
          { _id: '2', _cellConfidence: {}, Model: 'B', Year: '2021', Stock: '5', Price: '200' },
          { _id: '3', _cellConfidence: {}, Model: 'C', Year: '2022', Stock: '12', Price: '150' },
        ],
        itemColumnKey: 'Model',
        fields: [],
      },
    });

    expect(res.category).toBe('default');
    expect(res.recommendedTemplateIds.has('csv.default')).toBe(true);
    expect(res.reason).toBe('Detected table');
  });

  it('detects invoice when the word "invoice" appears in extracted text or fields with a multi-row table', () => {
    const res = recommendTemplate({
      extractedData: {
        columns: ['Item', 'Quantity', 'Unit Price', 'Total'],
        rows: [
          { _id: '1', _cellConfidence: {}, Item: 'Consulting Services', Quantity: '10', 'Unit Price': '150', Total: '1500' },
          { _id: '2', _cellConfidence: {}, Item: 'Software License', Quantity: '1', 'Unit Price': '500', Total: '500' },
          { _id: '3', _cellConfidence: {}, Item: 'Support Retainer', Quantity: '1', 'Unit Price': '300', Total: '300' },
        ],
        itemColumnKey: 'Item',
        fields: [
          { id: '1', key: 'doc_id', label: 'Invoice No', value: 'INV-2026-889', confidence: 0.95 },
          { id: '2', key: 'vendor', label: 'Provider', value: 'Acme Cloud Pty Ltd', confidence: 0.92 },
          { id: '3', key: 'total', label: 'Total Due', value: '$2,300.00', confidence: 0.96 },
        ],
        texts: [
          { id: 't1', role: 'header', text: 'TAX INVOICE', confidence: 0.99 },
          { id: 't2', role: 'body', text: 'Payment is due within 30 days', confidence: 0.95 },
        ],
      },
    });

    expect(res.category).toBe('invoice');
    expect(res.recommendedTemplateIds.has('csv.invoice')).toBe(true);
    expect(res.recommendedTemplateIds.has('xlsx.invoice')).toBe(true);
    expect(res.reason).toBe('Detected invoice');
  });
});
