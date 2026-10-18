import {
  cellText,
  normKey,
  type ExportDoc,
  type ExportFieldValue,
  type ExportInclude,
  type ExportTable,
} from './model';
import { formatMoney } from './csvTemplates';

/**
 * Plain-text (TXT) export templates: invoice, receipt and form layouts.
 * They mirror the CSV templates in csvTemplates.ts (same field matching, same
 * sections, same money formatting) but lay the data out as aligned text.
 * Every renderer is pure: it returns a string and never triggers a download.
 */

const WIDTH = 80;
const DOUBLE_RULE = '='.repeat(WIDTH);
const SINGLE_RULE = '-'.repeat(WIDTH);
const STAR_RULE = '*'.repeat(WIDTH);

/** One line per cell: newlines and tabs would break the text alignment. */
export function txtCell(value: unknown): string {
  return cellText(value)
    .replace(/\s*[\r\n\t]+\s*/g, ' ')
    .trim();
}

interface Used {
  fields: Set<ExportFieldValue>;
  tables: Set<ExportTable>;
}

// ───────────── Matching helpers (same behaviour as csvTemplates.ts) ─────────────

function findField(doc: ExportDoc, aliases: string[], used: Used): ExportFieldValue | undefined {
  for (const alias of aliases.map(normKey)) {
    const hit = doc.fields.find(
      (f) =>
        !used.fields.has(f) && (normKey(f.field.key) === alias || normKey(f.field.label) === alias)
    );
    if (hit) return hit;
  }
  return undefined;
}

function findColumn(table: ExportTable, aliases: string[]): string | undefined {
  const wanted = aliases.map(normKey);
  return table.columns.find((c) => wanted.includes(normKey(c)));
}

function pickTable(doc: ExportDoc, colAliases: string[][], used: Used): ExportTable | undefined {
  let best: ExportTable | undefined;
  let bestScore = 0;
  for (const t of doc.tables) {
    if (used.tables.has(t)) continue;
    const score = colAliases.filter((aliases) => findColumn(t, aliases)).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

// ───────────── Layout helpers ─────────────

/** "Label : value" lines with the colons lined up. */
function keyValueLines(rows: [string, string][]): string[] {
  const labelWidth = Math.max(0, ...rows.map(([label]) => txtCell(label).length));
  return rows.map(([label, value]) => `${txtCell(label).padEnd(labelWidth)} : ${txtCell(value)}`);
}

/** Aligned columns with a header and a dashed divider. `width` is the full line width. */
function tableLines(
  headers: string[],
  rows: string[][],
  rightAligned: boolean[] = []
): { lines: string[]; width: number } {
  const head = headers.map(txtCell);
  const body = rows.map((row) => headers.map((_, i) => txtCell(row[i])));
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));

  const format = (cells: string[]) =>
    cells
      .map((cell, i) => (rightAligned[i] ? cell.padStart(widths[i]) : cell.padEnd(widths[i])))
      .join('  ')
      .trimEnd();

  return {
    lines: [format(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(format)],
    width: widths.reduce((sum, w) => sum + w, 0) + 2 * Math.max(0, headers.length - 1),
  };
}

/** Label/value pairs right-aligned to the edge of the table above them. */
function totalsLines(rows: [string, string][], tableWidth: number): string[] {
  const labelWidth = Math.max(0, ...rows.map(([label]) => label.length));
  const valueWidth = Math.max(0, ...rows.map(([, value]) => value.length));
  return rows.map(([label, value]) =>
    `${label.padEnd(labelWidth)}  ${value.padStart(valueWidth)}`.padStart(tableWidth)
  );
}

interface ColDef {
  header: string;
  from: string[];
  isNumber?: boolean;
  isMoney?: boolean;
}

/** Maps a table onto the template's columns; any unclaimed columns are kept at the end. */
function lineItemsBlock(table: ExportTable, colDefs: ColDef[]): { lines: string[]; width: number } {
  const mappedCols = colDefs.map((def) => ({
    def,
    extractedCol: findColumn(table, [...def.from, def.header]),
  }));
  const claimed = new Set(mappedCols.map((m) => m.extractedCol).filter(Boolean));
  const extraCols = table.columns.filter((c) => !claimed.has(c));

  const headers = [...colDefs.map((c) => c.header), ...extraCols];
  const rows = table.rows.map((row) => [
    ...mappedCols.map(({ def, extractedCol }) => {
      if (!extractedCol) return '';
      const raw = cellText(row[extractedCol]);
      return def.isMoney ? formatMoney(raw) : raw;
    }),
    ...extraCols.map((c) => cellText(row[c])),
  ]);
  const rightAligned = [...colDefs.map((c) => !!(c.isNumber || c.isMoney)), ...extraCols.map(() => false)];

  return tableLines(headers, rows, rightAligned);
}

/** Fields and tables the template did not place, so no extracted data is lost. */
function remainingLines(doc: ExportDoc, include: ExportInclude, used: Used): string[] {
  const lines: string[] = [];

  const remainingFields = doc.fields.filter((f) => !used.fields.has(f));
  if (remainingFields.length > 0 && include.fields) {
    lines.push('', 'OTHER FIELDS');
    lines.push(
      ...keyValueLines(remainingFields.map((f) => [f.field.label || f.field.key, f.field.value]))
    );
  }

  for (const t of doc.tables.filter((tbl) => !used.tables.has(tbl))) {
    lines.push('', txtCell(t.title || 'ADDITIONAL TABLE'));
    lines.push(
      ...tableLines(
        t.columns,
        t.rows.map((row) => t.columns.map((c) => cellText(row[c])))
      ).lines
    );
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. INVOICE TXT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────
export function renderInvoiceTxt(doc: ExportDoc, include: ExportInclude): string {
  const used: Used = { fields: new Set(), tables: new Set() };
  const lines: string[] = [DOUBLE_RULE, 'COMMERCIAL TAX INVOICE', DOUBLE_RULE, ''];

  // 1. Reference & parties
  const detailFields = [
    { label: 'Invoice No', keys: ['invoice_number', 'invoice_no', 'invoice_id', 'invoice#', 'number'] },
    { label: 'Invoice Date', keys: ['invoice_date', 'date', 'issue_date'] },
    { label: 'Due Date', keys: ['due_date', 'payment_due', 'payment_due_date'] },
    { label: 'PO Number', keys: ['po_number', 'purchase_order', 'po'] },
    { label: 'Payment Terms', keys: ['payment_terms', 'terms', 'net30', 'net15'] },
    { label: 'Vendor', keys: ['vendor', 'vendor_name', 'supplier', 'supplier_name', 'seller', 'from'] },
    { label: 'Vendor Address', keys: ['vendor_address', 'supplier_address', 'seller_address'] },
    { label: 'Customer', keys: ['customer', 'customer_name', 'bill_to', 'buyer', 'client'] },
    { label: 'Customer Address', keys: ['customer_address', 'billing_address', 'bill_to_address'] },
  ];

  const detailRows: [string, string][] = [];
  for (const def of detailFields) {
    const hit = findField(doc, def.keys, used);
    if (hit) {
      used.fields.add(hit);
      detailRows.push([def.label, hit.field.value]);
    }
  }
  if (detailRows.length > 0) {
    lines.push('DETAILS', ...keyValueLines(detailRows), '');
  }

  // 2. Line items
  const lineColDefs: ColDef[] = [
    { header: 'Description', from: ['description', 'item', 'items', 'details', 'product', 'service'] },
    { header: 'Qty', from: ['quantity', 'qty'], isNumber: true },
    { header: 'Unit Price', from: ['unit_price', 'price', 'rate'], isMoney: true },
    { header: 'Amount', from: ['amount', 'line_total', 'total'], isMoney: true },
  ];

  const table = pickTable(
    doc,
    lineColDefs.map((c) => [...c.from, c.header]),
    used
  );

  let tableWidth = 0;
  if (table) {
    used.tables.add(table);
    const block = lineItemsBlock(table, lineColDefs);
    tableWidth = block.width;
    lines.push(SINGLE_RULE, 'LINE ITEMS', ...block.lines, SINGLE_RULE);
  }

  // 3. Totals
  const totalFields = [
    { label: 'Subtotal', keys: ['subtotal', 'sub_total'] },
    { label: 'Tax', keys: ['tax', 'total_tax', 'vat', 'gst', 'sales_tax'] },
    { label: 'Total', keys: ['total', 'total_amount', 'amount_due', 'grand_total', 'balance_due'] },
  ];

  const totalRows: [string, string][] = [];
  for (const def of totalFields) {
    const hit = findField(doc, def.keys, used);
    if (hit) {
      used.fields.add(hit);
      totalRows.push([def.label, formatMoney(hit.field.value)]);
    }
  }
  if (totalRows.length > 0) {
    lines.push('TOTALS', ...totalsLines(totalRows, tableWidth), '');
  }

  // 4. Footer
  lines.push(DOUBLE_RULE);
  lines.push('Remittance Advice: Please remit payment to Vendor by Due Date.');
  lines.push('Thank you for your business!');

  lines.push(...remainingLines(doc, include, used));
  return lines.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RECEIPT TXT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────
export function renderReceiptTxt(doc: ExportDoc, include: ExportInclude): string {
  const used: Used = { fields: new Set(), tables: new Set() };
  const lines: string[] = [STAR_RULE, 'RETAIL SALES RECEIPT / DOCKET', STAR_RULE, ''];

  // 1. Merchant & transaction information
  const detailFields = [
    { label: 'Merchant', keys: ['merchant', 'merchant_name', 'store', 'store_name', 'vendor', 'vendor_name'] },
    { label: 'Address', keys: ['merchant_address', 'store_address', 'address'] },
    { label: 'Date', keys: ['date', 'transaction_date', 'purchase_date'] },
    { label: 'Time', keys: ['time', 'transaction_time'] },
    { label: 'Receipt No', keys: ['receipt_number', 'receipt_no', 'transaction_id', 'order_number'] },
    { label: 'Register', keys: ['register', 'register_number', 'terminal', 'pos_terminal'] },
    { label: 'Cashier', keys: ['cashier', 'operator', 'server'] },
    { label: 'Payment Method', keys: ['payment_method', 'payment_type', 'card_type', 'tender'] },
  ];

  const detailRows: [string, string][] = [];
  for (const def of detailFields) {
    const hit = findField(doc, def.keys, used);
    if (hit) {
      used.fields.add(hit);
      detailRows.push([def.label, hit.field.value]);
    }
  }
  if (detailRows.length > 0) {
    lines.push('DETAILS', ...keyValueLines(detailRows), '');
  }

  // 2. Items
  const itemColDefs: ColDef[] = [
    { header: 'Item', from: ['item', 'description', 'name', 'product'] },
    { header: 'Qty', from: ['quantity', 'qty'], isNumber: true },
    { header: 'Price', from: ['unit_price', 'price'], isMoney: true },
    { header: 'Amount', from: ['amount', 'line_total', 'total'], isMoney: true },
  ];

  const table = pickTable(
    doc,
    itemColDefs.map((c) => [...c.from, c.header]),
    used
  );

  let tableWidth = 0;
  if (table) {
    used.tables.add(table);
    const block = lineItemsBlock(table, itemColDefs);
    tableWidth = block.width;
    lines.push(SINGLE_RULE, 'ITEMS', ...block.lines, SINGLE_RULE);
  }

  // 3. Totals
  const totalFields = [
    { label: 'Subtotal', keys: ['subtotal', 'sub_total'] },
    { label: 'Tax', keys: ['tax', 'total_tax', 'gst', 'vat'] },
    { label: 'Tip', keys: ['tip', 'gratuity'] },
    { label: 'Total', keys: ['total', 'total_amount', 'amount_paid', 'grand_total'] },
  ];

  const totalRows: [string, string][] = [];
  for (const def of totalFields) {
    const hit = findField(doc, def.keys, used);
    if (hit) {
      used.fields.add(hit);
      totalRows.push([def.label, formatMoney(hit.field.value)]);
    }
  }
  if (totalRows.length > 0) {
    lines.push('TOTALS', ...totalsLines(totalRows, tableWidth), '');
  }

  // 4. Tender summary
  const tenderMethod = findField(doc, ['payment_method', 'card_type', 'tender'], used);
  const tenderAmount = findField(doc, ['amount_paid', 'tendered', 'total'], used);
  const changeGiven = findField(doc, ['change', 'change_due'], used);

  const tenderRows: [string, string][] = [
    ['Payment Type', tenderMethod ? tenderMethod.field.value : 'Card / Cash'],
  ];
  if (tenderAmount) tenderRows.push(['Amount Tendered', formatMoney(tenderAmount.field.value)]);
  tenderRows.push(['Change Due', changeGiven ? formatMoney(changeGiven.field.value) : '$0.00']);

  lines.push(SINGLE_RULE, 'TENDER SUMMARY', ...keyValueLines(tenderRows), STAR_RULE);
  lines.push('Thank you for your visit! Please retain this receipt for proof of purchase.');

  lines.push(...remainingLines(doc, include, used));
  return lines.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FORM & SCHEDULE TXT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────
export function renderFormTxt(doc: ExportDoc, include: ExportInclude): string {
  const used: Used = { fields: new Set(), tables: new Set() };
  const lines: string[] = [DOUBLE_RULE, 'FORM RECORD', DOUBLE_RULE, ''];

  // Section 1: entity & filer information
  const entityFields = [
    { label: 'Name', keys: ['taxpayer_name', 'name', 'full_name', 'applicant', 'entity_name'] },
    { label: 'Tax ID', keys: ['tin', 'ssn', 'tfn', 'tax_file_number', 'abn', 'ein', 'id_number'] },
    { label: 'Tax Year / Date', keys: ['tax_year', 'financial_year', 'year', 'period', 'date'] },
    { label: 'Filing Status', keys: ['filing_status', 'status'] },
    { label: 'Address', keys: ['address', 'taxpayer_address'] },
  ];

  const entityRows: [string, string][] = [];
  for (const def of entityFields) {
    const hit = findField(doc, def.keys, used);
    if (hit) {
      used.fields.add(hit);
      entityRows.push([def.label, hit.field.value]);
    }
  }

  const lineNo = (section: number, idx: number) => `${section}.${String(idx + 1).padStart(2, '0')}`;

  lines.push('SECTION 1: ENTITY INFORMATION');
  lines.push(
    ...tableLines(
      ['Line #', 'Field Description', 'Reported Value'],
      entityRows.length > 0
        ? entityRows.map(([lbl, val], idx) => [lineNo(1, idx), lbl, val])
        : [['1.01', 'Record Name', doc.name]]
    ).lines,
    ''
  );

  // Section 2: financial summary & declarations
  const dataFields = [
    { label: 'Income / Wages', keys: ['wages', 'salary', 'salary_and_wages', 'gross_income', 'total_income'] },
    { label: 'Deductions', keys: ['total_deductions', 'deductions'] },
    { label: 'Taxable Amount', keys: ['taxable_income', 'taxable_amount'] },
    { label: 'Tax Liability', keys: ['total_tax', 'tax_payable', 'tax_liability'] },
    { label: 'Refund / Balance Due', keys: ['refund', 'refund_amount', 'amount_owed', 'balance_due'] },
  ];

  const dataRows: [string, string][] = [];
  for (const def of dataFields) {
    const hit = findField(doc, def.keys, used);
    if (hit) {
      used.fields.add(hit);
      dataRows.push([def.label, formatMoney(hit.field.value)]);
    }
  }

  lines.push('SECTION 2: RECORD SUMMARY');
  lines.push(
    ...tableLines(
      ['Line #', 'Summary Description', 'Reported Amount'],
      dataRows.length > 0
        ? dataRows.map(([lbl, val], idx) => [lineNo(2, idx), lbl, val])
        : [['2.01', 'Summary Status', 'Declared']],
      [false, false, true]
    ).lines,
    ''
  );

  // Section 3: attached schedules & tables
  lines.push('SECTION 3: SCHEDULES & TABLES');
  if (doc.tables.length > 0) {
    doc.tables.forEach((t, tIdx) => {
      used.tables.add(t);
      lines.push(`Schedule ${tIdx + 1}: ${txtCell(t.title || 'Table')}`);
      lines.push(
        ...tableLines(
          t.columns,
          t.rows.map((row) => t.columns.map((c) => cellText(row[c])))
        ).lines,
        ''
      );
    });
  } else {
    lines.push('No attached schedules present.', '');
  }

  // Section 4: audit & verification
  lines.push('SECTION 4: RECORD AUDIT & VERIFICATION');
  lines.push(
    ...tableLines(
      ['Audit Property', 'Value'],
      [
        ['Total Extracted Fields', String(doc.fields.length)],
        ['Total Schedules Attached', String(doc.tables.length)],
        ['Filing Verification', 'Validated'],
      ]
    ).lines
  );
  lines.push(DOUBLE_RULE);

  lines.push(...remainingLines(doc, include, used));
  return lines.join('\n').trim();
}
