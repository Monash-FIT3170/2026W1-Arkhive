import { describe, expect, it } from 'vitest';
import {
  csvCell,
  renderDefaultCsv,
  renderInvoiceCsv,
  renderReceiptCsv,
  renderFormCsv,
} from './csvTemplates';
import type { ExportDoc, ExportInclude } from './model';

const includeAll: ExportInclude = { tables: 'all', fields: true, texts: true };

describe('csvCell escaping', () => {
  it('escapes quotes and wraps strings with commas or newlines', () => {
    expect(csvCell('hello, world')).toBe('"hello, world"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain text')).toBe('plain text');
  });

  it('prevents formula injection by prepending space to formulas', () => {
    expect(csvCell('=SUM(A1:A10)')).toBe(' =SUM(A1:A10)');
    expect(csvCell('@command')).toBe(' @command');
    expect(csvCell('+something')).toBe(' +something');
    // Regular numbers with minus or plus should stay as plain numbers
    expect(csvCell('-42')).toBe('-42');
    expect(csvCell('+5.5')).toBe('+5.5');
  });
});

describe('renderDefaultCsv', () => {
  it('renders a plain table dump without extra formatting', () => {
    const doc: ExportDoc = {
      name: 'test',
      pages: [],
      tables: [
        {
          title: 'Table 1',
          columns: ['Item', 'Quantity', 'Price'],
          itemColumnKey: 'Item',
          rows: [
            { _id: '1', _cellConfidence: {}, Item: 'Apples', Quantity: '3', Price: '$4.50' },
            { _id: '2', _cellConfidence: {}, Item: 'Bananas', Quantity: '2', Price: '$2.00' },
          ],
          origins: ['Page 1', 'Page 1'],
        },
      ],
      fields: [],
      texts: [],
    };

    const csv = renderDefaultCsv(doc, includeAll);
    expect(csv).toContain('Item,Quantity,Price');
    expect(csv).toContain('Apples,3,$4.50');
    expect(csv).toContain('Bananas,2,$2.00');
    // Should NOT have INVOICE or DETAILS headers
    expect(csv).not.toContain('INVOICE');
    expect(csv).not.toContain('DETAILS');
  });
});

describe('renderInvoiceCsv', () => {
  it('renders an invoice with metadata details, line items table, and totals', () => {
    const doc: ExportDoc = {
      name: 'invoice_doc',
      pages: [],
      fields: [
        { origin: 'Page 1', field: { id: 'f1', key: 'invoice_number', label: 'Invoice No', value: 'INV-9921', confidence: 0.99 } },
        { origin: 'Page 1', field: { id: 'f2', key: 'invoice_date', label: 'Invoice Date', value: '2024-04-01', confidence: 0.95 } },
        { origin: 'Page 1', field: { id: 'f3', key: 'vendor', label: 'Vendor', value: 'Acme Hardware', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f4', key: 'subtotal', label: 'Subtotal', value: '100.00', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f5', key: 'total_amount', label: 'Total', value: '110.00', confidence: 0.9 } },
      ],
      tables: [
        {
          title: 'Line Items',
          columns: ['Description', 'Qty', 'Unit Price', 'Total'],
          itemColumnKey: 'Description',
          rows: [
            { _id: '1', _cellConfidence: {}, Description: 'Hammer', Qty: '2', 'Unit Price': '25.00', Total: '50.00' },
            { _id: '2', _cellConfidence: {}, Description: 'Nails (box)', Qty: '1', 'Unit Price': '50.00', Total: '50.00' },
          ],
          origins: ['Page 1', 'Page 1'],
        },
      ],
      texts: [],
    };

    const csv = renderInvoiceCsv(doc, includeAll);

    // Header check
    expect(csv).toContain('INVOICE');

    // Details block check
    expect(csv).toContain('DETAILS');
    expect(csv).toContain('Invoice No,INV-9921');
    expect(csv).toContain('Invoice Date,2024-04-01');
    expect(csv).toContain('Vendor,Acme Hardware');

    // Line items block check
    expect(csv).toContain('LINE ITEMS');
    expect(csv).toContain('Description,Qty,Unit Price,Amount');
    expect(csv).toContain('Hammer,2,$25.00,$50.00');

    // Totals check
    expect(csv).toContain('TOTALS');
    expect(csv).toContain('Subtotal,$100.00');
    expect(csv).toContain('Total,$110.00');
  });
});

describe('renderReceiptCsv', () => {
  it('renders a receipt with merchant details, items, and payment totals', () => {
    const doc: ExportDoc = {
      name: 'receipt_doc',
      pages: [],
      fields: [
        { origin: 'Page 1', field: { id: 'f1', key: 'merchant', label: 'Merchant', value: 'Coffee Central', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f2', key: 'date', label: 'Date', value: '2024-05-12', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f3', key: 'receipt_no', label: 'Receipt No', value: 'RC-101', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f4', key: 'tip', label: 'Tip', value: '2.00', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f5', key: 'amount_paid', label: 'Total', value: '12.50', confidence: 0.9 } },
      ],
      tables: [
        {
          title: 'Items',
          columns: ['Item', 'Quantity', 'Price', 'Amount'],
          itemColumnKey: 'Item',
          rows: [
            { _id: '1', _cellConfidence: {}, Item: 'Flat White', Quantity: '2', Price: '4.50', Amount: '9.00' },
            { _id: '2', _cellConfidence: {}, Item: 'Cookie', Quantity: '1', Price: '1.50', Amount: '1.50' },
          ],
          origins: ['Page 1', 'Page 1'],
        },
      ],
      texts: [],
    };

    const csv = renderReceiptCsv(doc, includeAll);

    expect(csv).toContain('RECEIPT');
    expect(csv).toContain('DETAILS');
    expect(csv).toContain('Merchant,Coffee Central');
    expect(csv).toContain('Date,2024-05-12');
    expect(csv).toContain('Receipt No,RC-101');

    expect(csv).toContain('ITEMS');
    expect(csv).toContain('Item,Qty,Price,Amount');
    expect(csv).toContain('Flat White,2,$4.50,$9.00');

    expect(csv).toContain('TOTALS');
    expect(csv).toContain('Tip,$2.00');
    expect(csv).toContain('Total,$12.50');
  });
});

describe('renderFormCsv', () => {
  it('renders a form with entity information, record fields, and schedules', () => {
    const doc: ExportDoc = {
      name: 'form_doc',
      pages: [],
      fields: [
        { origin: 'Page 1', field: { id: 'f1', key: 'taxpayer_name', label: 'Name', value: 'Jane Smith', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f2', key: 'tin', label: 'Tax ID', value: '123-45-678', confidence: 0.9 } },
        { origin: 'Page 1', field: { id: 'f3', key: 'wages', label: 'Wages', value: '85000', confidence: 0.9 } },
      ],
      tables: [
        {
          title: 'Schedule A',
          columns: ['Deduction Category', 'Claimed Amount'],
          itemColumnKey: 'Deduction Category',
          rows: [{ _id: '1', _cellConfidence: {}, 'Deduction Category': 'Work Travel', 'Claimed Amount': '1200' }],
          origins: ['Page 1'],
        },
      ],
      texts: [],
    };

    const csv = renderFormCsv(doc, includeAll);

    expect(csv).toContain('FORM RECORD');
    expect(csv).toContain('ENTITY INFORMATION');
    expect(csv).toContain('Name,Jane Smith');
    expect(csv).toContain('Tax ID,123-45-678');
    expect(csv).toContain('RECORD SUMMARY');
    expect(csv).toContain('Income / Wages,$85000.00');
    expect(csv).toContain('SCHEDULES & TABLES');
    expect(csv).toContain('Schedule A');
  });

  it('proves distinct structural differentiation between Invoice, Receipt, Form, and Default templates', () => {
    const doc: ExportDoc = {
      name: 'unified_test',
      pages: [],
      fields: [
        { origin: 'P1', field: { id: '1', key: 'vendor', label: 'Vendor', value: 'Store Co', confidence: 0.9 } },
        { origin: 'P1', field: { id: '2', key: 'invoice_number', label: 'Number', value: 'INV-10', confidence: 0.9 } },
        { origin: 'P1', field: { id: '3', key: 'total', label: 'Total', value: '50.00', confidence: 0.9 } },
      ],
      tables: [
        {
          title: 'Items',
          columns: ['Description', 'Qty', 'Amount'],
          itemColumnKey: 'Description',
          rows: [{ _id: '1', _cellConfidence: {}, Description: 'Item A', Qty: '1', Amount: '50.00' }],
          origins: ['P1'],
        },
      ],
      texts: [],
    };

    const defaultCsv = renderDefaultCsv(doc, includeAll);
    const invoiceCsv = renderInvoiceCsv(doc, includeAll);
    const receiptCsv = renderReceiptCsv(doc, includeAll);
    const formCsv = renderFormCsv(doc, includeAll);

    // Default is clean tabular dump without decorative banners
    expect(defaultCsv).not.toContain('===');
    expect(defaultCsv).not.toContain('***');
    expect(defaultCsv).toContain('Description,Qty,Amount');

    // Invoice has formal tax invoice headers, remittance advice, and LINE ITEMS
    expect(invoiceCsv).toContain('COMMERCIAL TAX INVOICE');
    expect(invoiceCsv).toContain('Remittance Advice');
    expect(invoiceCsv).toContain('LINE ITEMS');

    // Receipt has POS docket headers and Tender summary
    expect(receiptCsv).toContain('RETAIL SALES RECEIPT / DOCKET');
    expect(receiptCsv).toContain('TENDER SUMMARY');
    expect(receiptCsv).toContain('Change Due');

    // Form has numbered sections and audit verification
    expect(formCsv).toContain('SECTION 1: ENTITY INFORMATION');
    expect(formCsv).toContain('SECTION 4: RECORD AUDIT & VERIFICATION');
  });
});
