import {
  cellText,
  normKey,
  type ExportDoc,
  type ExportFieldValue,
  type ExportInclude,
  type ExportTable,
} from './model';
import { parseNumber } from './xlsxTemplates';

const BOM = '\uFEFF'; // lets Excel read UTF-8 correctly
const NUMERIC = /^[+-]?\d[\d,]*\.?\d*$/;

/**
 * Escapes CSV cell values.
 * Wraps in quotes if contains comma, quote, or newline.
 * Guards against Excel formula injection for cells starting with =, +, -, @.
 */
export function csvCell(value: unknown): string {
  let raw = cellText(value);
  if (/^[=+\-@\t\r]/.test(raw) && !NUMERIC.test(raw)) {
    raw = ` ${raw}`;
  }
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function formatMoney(raw: string): string {
  const n = parseNumber(raw);
  if (n === null) return raw;
  return `$${n.toFixed(2)}`;
}

interface Used {
  fields: Set<ExportFieldValue>;
  tables: Set<ExportTable>;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEFAULT CSV TEMPLATE (Raw, unadorned flat data dump)
// ─────────────────────────────────────────────────────────────────────────────
export function renderDefaultCsv(doc: ExportDoc, include: ExportInclude): string {
  const lines: string[] = [];

  // Plain tabular output with raw numbers for analysis and data ingestion
  doc.tables.forEach((table, index) => {
    if (index > 0) lines.push('');
    if (doc.tables.length > 1) {
      lines.push(`# Table: ${table.title || `Table ${index + 1}`}`);
    }
    lines.push(table.columns.map(csvCell).join(','));
    for (const row of table.rows) {
      lines.push(table.columns.map((col) => csvCell(row[col])).join(','));
    }
  });

  // If document fields are included, output them cleanly as metadata
  if (include.fields && doc.fields.length > 0) {
    if (doc.tables.length > 0) {
      lines.push('');
      lines.push('# Document Metadata');
    }
    lines.push(['Field', 'Value'].map(csvCell).join(','));
    for (const f of doc.fields) {
      lines.push([csvCell(f.field.label || f.field.key), csvCell(f.field.value)].join(','));
    }
  }

  return BOM + lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INVOICE CSV TEMPLATE (Commercial B2B Tax Invoice with aligned totals)
// ─────────────────────────────────────────────────────────────────────────────
export function renderInvoiceCsv(doc: ExportDoc, include: ExportInclude): string {
  const used: Used = { fields: new Set(), tables: new Set() };
  const lines: string[] = [];

  lines.push('================================================================================');
  lines.push('COMMERCIAL TAX INVOICE');
  lines.push('================================================================================');
  lines.push('');

  // 1. Reference & B2B Parties Block
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
    lines.push('DETAILS');
    detailRows.forEach(([lbl, val]) => lines.push(`${csvCell(lbl)},${csvCell(val)}`));
    lines.push('');
  }

  // 2. Line Items Table
  const lineColDefs = [
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

  let finalColCount = lineColDefs.length;

  if (table) {
    used.tables.add(table);
    lines.push('--------------------------------------------------------------------------------');
    lines.push('LINE ITEMS');

    const mappedCols = lineColDefs.map((colDef) => ({
      def: colDef,
      extractedCol: findColumn(table, [...colDef.from, colDef.header]),
    }));

    const claimedCols = new Set(mappedCols.map((m) => m.extractedCol).filter(Boolean));
    const extraCols = table.columns.filter((c) => !claimedCols.has(c));

    const finalHeaders = [...lineColDefs.map((c) => c.header), ...extraCols];
    finalColCount = finalHeaders.length;
    lines.push(finalHeaders.map(csvCell).join(','));

    for (const row of table.rows) {
      const rowValues = [
        ...mappedCols.map(({ def, extractedCol }) => {
          if (!extractedCol) return '';
          const raw = cellText(row[extractedCol]);
          if (def.isMoney) return formatMoney(raw);
          return raw;
        }),
        ...extraCols.map((c) => cellText(row[c])),
      ];
      lines.push(rowValues.map(csvCell).join(','));
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  // 3. Totals Block (Right-aligned under Amount column for spreadsheet clarity)
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
    lines.push('TOTALS');
    const padCount = Math.max(0, finalColCount - 2);
    const leadingPadding = padCount > 0 ? Array(padCount).fill('').join(',') + ',' : '';
    totalRows.forEach(([lbl, val]) => {
      lines.push(`${leadingPadding}${csvCell(lbl)},${csvCell(val)}`);
    });
    lines.push('');
  }

  // 4. Commercial Remittance Footer
  lines.push('================================================================================');
  lines.push('Remittance Advice: Please remit payment to Vendor by Due Date.');
  lines.push('Thank you for your business!');

  // 5. Remaining fields or tables
  const remainingFields = doc.fields.filter((f) => !used.fields.has(f));
  if (remainingFields.length > 0 && include.fields) {
    lines.push('');
    lines.push('OTHER FIELDS');
    remainingFields.forEach((f) =>
      lines.push(`${csvCell(f.field.label || f.field.key)},${csvCell(f.field.value)}`)
    );
  }

  const remainingTables = doc.tables.filter((t) => !used.tables.has(t));
  if (remainingTables.length > 0) {
    remainingTables.forEach((t) => {
      lines.push('');
      lines.push(csvCell(t.title || 'ADDITIONAL TABLE'));
      lines.push(t.columns.map(csvCell).join(','));
      for (const row of t.rows) {
        lines.push(t.columns.map((c) => csvCell(row[c])).join(','));
      }
    });
  }

  return BOM + lines.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RECEIPT CSV TEMPLATE (Retail POS Transaction Docket with Tender Summary)
// ─────────────────────────────────────────────────────────────────────────────
export function renderReceiptCsv(doc: ExportDoc, include: ExportInclude): string {
  const used: Used = { fields: new Set(), tables: new Set() };
  const lines: string[] = [];

  lines.push('********************************************************************************');
  lines.push('RETAIL SALES RECEIPT / DOCKET');
  lines.push('********************************************************************************');
  lines.push('');

  // 1. Merchant & POS Transaction Information
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
    lines.push('DETAILS');
    detailRows.forEach(([lbl, val]) => lines.push(`${csvCell(lbl)},${csvCell(val)}`));
    lines.push('');
  }

  // 2. Receipt Items Table
  const itemColDefs = [
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

  let finalColCount = itemColDefs.length;

  if (table) {
    used.tables.add(table);
    lines.push('--------------------------------------------------------------------------------');
    lines.push('ITEMS');

    const mappedCols = itemColDefs.map((colDef) => ({
      def: colDef,
      extractedCol: findColumn(table, [...colDef.from, colDef.header]),
    }));

    const claimedCols = new Set(mappedCols.map((m) => m.extractedCol).filter(Boolean));
    const extraCols = table.columns.filter((c) => !claimedCols.has(c));

    const finalHeaders = [...itemColDefs.map((c) => c.header), ...extraCols];
    finalColCount = finalHeaders.length;
    lines.push(finalHeaders.map(csvCell).join(','));

    for (const row of table.rows) {
      const rowValues = [
        ...mappedCols.map(({ def, extractedCol }) => {
          if (!extractedCol) return '';
          const raw = cellText(row[extractedCol]);
          if (def.isMoney) return formatMoney(raw);
          return raw;
        }),
        ...extraCols.map((c) => cellText(row[c])),
      ];
      lines.push(rowValues.map(csvCell).join(','));
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  // 3. Receipt Totals
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
    lines.push('TOTALS');
    const padCount = Math.max(0, finalColCount - 2);
    const leadingPadding = padCount > 0 ? Array(padCount).fill('').join(',') + ',' : '';
    totalRows.forEach(([lbl, val]) => {
      lines.push(`${leadingPadding}${csvCell(lbl)},${csvCell(val)}`);
    });
    lines.push('');
  }

  // 4. Tender & POS Settlement Breakdown
  const tenderMethod = findField(doc, ['payment_method', 'card_type', 'tender'], used);
  const tenderAmount = findField(doc, ['amount_paid', 'tendered', 'total'], used);
  const changeGiven = findField(doc, ['change', 'change_due'], used);

  lines.push('--------------------------------------------------------------------------------');
  lines.push('TENDER SUMMARY');
  lines.push(`Payment Type,${csvCell(tenderMethod ? tenderMethod.field.value : 'Card / Cash')}`);
  if (tenderAmount) {
    lines.push(`Amount Tendered,${csvCell(formatMoney(tenderAmount.field.value))}`);
  }
  lines.push(`Change Due,${csvCell(changeGiven ? formatMoney(changeGiven.field.value) : '$0.00')}`);
  lines.push('********************************************************************************');
  lines.push('Thank you for your visit! Please retain this receipt for proof of purchase.');

  // 5. Remaining fields or tables
  const remainingFields = doc.fields.filter((f) => !used.fields.has(f));
  if (remainingFields.length > 0 && include.fields) {
    lines.push('');
    lines.push('OTHER FIELDS');
    remainingFields.forEach((f) =>
      lines.push(`${csvCell(f.field.label || f.field.key)},${csvCell(f.field.value)}`)
    );
  }

  const remainingTables = doc.tables.filter((t) => !used.tables.has(t));
  if (remainingTables.length > 0) {
    remainingTables.forEach((t) => {
      lines.push('');
      lines.push(csvCell(t.title || 'ADDITIONAL TABLE'));
      lines.push(t.columns.map(csvCell).join(','));
      for (const row of t.rows) {
        lines.push(t.columns.map((c) => csvCell(row[c])).join(','));
      }
    });
  }

  return BOM + lines.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FORM & SCHEDULE CSV TEMPLATE (Official Filing Matrix with Section Codes)
// ─────────────────────────────────────────────────────────────────────────────
export function renderFormCsv(doc: ExportDoc, include: ExportInclude): string {
  const used: Used = { fields: new Set(), tables: new Set() };
  const lines: string[] = [];

  lines.push('================================================================================');
  lines.push('FORM RECORD');
  lines.push('================================================================================');
  lines.push('');

  // Section 1: Entity & Filer Information
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

  lines.push('SECTION 1: ENTITY INFORMATION');
  lines.push('Line #,Field Description,Reported Value');
  if (entityRows.length > 0) {
    entityRows.forEach(([lbl, val], idx) => {
      lines.push(`1.${String(idx + 1).padStart(2, '0')},${csvCell(lbl)},${csvCell(val)}`);
    });
  } else {
    lines.push('1.01,Record Name,' + csvCell(doc.name));
  }
  lines.push('');

  // Section 2: Financial Summary & Declarations
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
  lines.push('Line #,Summary Description,Reported Amount');
  if (dataRows.length > 0) {
    dataRows.forEach(([lbl, val], idx) => {
      lines.push(`2.${String(idx + 1).padStart(2, '0')},${csvCell(lbl)},${csvCell(val)}`);
    });
  } else {
    lines.push('2.01,Summary Status,Declared');
  }
  lines.push('');

  // Section 3: Attached Schedules & Tables
  lines.push('SECTION 3: SCHEDULES & TABLES');
  if (doc.tables.length > 0) {
    doc.tables.forEach((t, tIdx) => {
      used.tables.add(t);
      lines.push(`Schedule ${tIdx + 1}: ${csvCell(t.title || 'Table')}`);
      lines.push(t.columns.map(csvCell).join(','));
      for (const row of t.rows) {
        lines.push(t.columns.map((c) => csvCell(row[c])).join(','));
      }
      lines.push('');
    });
  } else {
    lines.push('No attached schedules present.');
    lines.push('');
  }

  // Section 4: Audit & Verification
  lines.push('SECTION 4: RECORD AUDIT & VERIFICATION');
  lines.push('Audit Property,Value');
  lines.push(`Total Extracted Fields,${doc.fields.length}`);
  lines.push(`Total Schedules Attached,${doc.tables.length}`);
  lines.push('Filing Verification,Validated');
  lines.push('================================================================================');

  // Other remaining fields
  const remainingFields = doc.fields.filter((f) => !used.fields.has(f));
  if (remainingFields.length > 0 && include.fields) {
    lines.push('');
    lines.push('OTHER FIELDS');
    remainingFields.forEach((f) =>
      lines.push(`${csvCell(f.field.label || f.field.key)},${csvCell(f.field.value)}`)
    );
  }

  return BOM + lines.join('\n').trim();
}
