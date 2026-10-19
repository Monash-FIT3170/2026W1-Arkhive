import type { WorkbookSpec } from './xlsxTemplates';

/**
 * XLSX templates for specific document types. Each one is DATA, not code.
 *
 * To add a template:
 *   1. add a WorkbookSpec below,
 *   2. add it to XLSX_PROFILES.
 * It shows up in the modal automatically.
 *
 * `keys` / `from` are alias lists matched case- and punctuation-insensitively against
 * the extracted field key / label and column names ("Invoice No." == invoice_no).
 * If you already have DocProfile.expectedFields, generate these lists from it.
 */

export const INVOICE_SPEC: WorkbookSpec = {
  id: 'invoice',
  label: 'Invoice',
  form: true,
  sheets: [
    {
      name: 'Invoice',
      blocks: [
        { kind: 'title', text: 'Invoice' },
        {
          kind: 'fields',
          heading: 'Details',
          fields: [
            {
              label: 'Invoice No',
              keys: ['invoice_number', 'invoice_no', 'invoice_id', 'invoice#', 'number'],
            },
            { label: 'Invoice Date', keys: ['invoice_date', 'date', 'issue_date'] },
            { label: 'Due Date', keys: ['due_date', 'payment_due', 'payment_due_date'] },
            { label: 'PO Number', keys: ['po_number', 'purchase_order', 'po'] },
            {
              label: 'Vendor',
              keys: ['vendor', 'vendor_name', 'supplier', 'supplier_name', 'seller', 'from'],
            },
            {
              label: 'Vendor Address',
              keys: ['vendor_address', 'supplier_address', 'seller_address'],
            },
            {
              label: 'Customer',
              keys: ['customer', 'customer_name', 'bill_to', 'buyer', 'client'],
            },
            {
              label: 'Customer Address',
              keys: ['customer_address', 'billing_address', 'bill_to_address'],
            },
          ],
        },
        {
          kind: 'table',
          heading: 'Line items',
          columns: [
            {
              header: 'Description',
              from: ['description', 'item', 'items', 'details', 'product', 'service'],
            },
            { header: 'Qty', from: ['quantity', 'qty'], format: 'number' },
            { header: 'Unit Price', from: ['unit_price', 'price', 'rate'], format: 'money' },
            { header: 'Amount', from: ['amount', 'line_total', 'total'], format: 'money' },
          ],
        },
        {
          kind: 'fields',
          heading: 'Totals',
          fields: [
            { label: 'Subtotal', keys: ['subtotal', 'sub_total'], format: 'money' },
            {
              label: 'Tax',
              keys: ['tax', 'total_tax', 'vat', 'gst', 'sales_tax'],
              format: 'money',
            },
            {
              label: 'Total',
              keys: ['total', 'total_amount', 'amount_due', 'grand_total', 'balance_due'],
              format: 'money',
            },
          ],
        },
      ],
    },
  ],
};

export const RECEIPT_SPEC: WorkbookSpec = {
  id: 'receipt',
  label: 'Receipt',
  form: true,
  sheets: [
    {
      name: 'Receipt',
      blocks: [
        { kind: 'title', text: 'Receipt' },
        {
          kind: 'fields',
          heading: 'Details',
          fields: [
            {
              label: 'Merchant',
              keys: ['merchant', 'merchant_name', 'store', 'store_name', 'vendor', 'vendor_name'],
            },
            { label: 'Address', keys: ['merchant_address', 'store_address', 'address'] },
            { label: 'Date', keys: ['date', 'transaction_date', 'purchase_date'] },
            { label: 'Time', keys: ['time', 'transaction_time'] },
            {
              label: 'Receipt No',
              keys: [
                'receipt_number',
                'receipt_no',
                'transaction_id',
                'order_number',
                'invoice_number',
              ],
            },
            {
              label: 'Payment Method',
              keys: ['payment_method', 'payment_type', 'card_type', 'tender'],
            },
          ],
        },
        {
          kind: 'table',
          heading: 'Items',
          columns: [
            { header: 'Item', from: ['item', 'description', 'name', 'product'] },
            { header: 'Qty', from: ['quantity', 'qty'], format: 'number' },
            { header: 'Price', from: ['unit_price', 'price'], format: 'money' },
            { header: 'Amount', from: ['amount', 'line_total', 'total'], format: 'money' },
          ],
        },
        {
          kind: 'fields',
          heading: 'Totals',
          fields: [
            { label: 'Subtotal', keys: ['subtotal', 'sub_total'], format: 'money' },
            { label: 'Tax', keys: ['tax', 'total_tax', 'gst', 'vat'], format: 'money' },
            { label: 'Tip', keys: ['tip', 'gratuity'], format: 'money' },
            {
              label: 'Total',
              keys: ['total', 'total_amount', 'amount_paid', 'grand_total'],
              format: 'money',
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Field keys for tax forms vary a lot between countries and form types, so treat these
 * aliases as a starting point and extend them against real extractions.
 */
export const TAX_RETURN_SPEC: WorkbookSpec = {
  id: 'tax_return',
  label: 'Tax Return',
  form: true,
  sheets: [
    {
      name: 'Return',
      blocks: [
        { kind: 'title', text: 'Tax Return' },
        {
          kind: 'fields',
          heading: 'Taxpayer',
          fields: [
            { label: 'Name', keys: ['taxpayer_name', 'name', 'full_name'] },
            {
              label: 'Tax ID',
              keys: ['tin', 'ssn', 'tfn', 'tax_file_number', 'abn', 'ein', 'id_number'],
            },
            { label: 'Tax Year', keys: ['tax_year', 'financial_year', 'year', 'period'] },
            { label: 'Filing Status', keys: ['filing_status'] },
            { label: 'Address', keys: ['address', 'taxpayer_address'] },
          ],
        },
        {
          kind: 'fields',
          heading: 'Income',
          fields: [
            {
              label: 'Wages / Salary',
              keys: ['wages', 'salary', 'salary_and_wages', 'gross_payments', 'gross_income'],
              format: 'money',
            },
            {
              label: 'Interest',
              keys: ['interest', 'interest_income', 'taxable_interest'],
              format: 'money',
            },
            {
              label: 'Dividends',
              keys: ['dividends', 'dividend_income', 'ordinary_dividends'],
              format: 'money',
            },
            { label: 'Other Income', keys: ['other_income'], format: 'money' },
            {
              label: 'Total Income',
              keys: ['total_income', 'gross_total_income'],
              format: 'money',
            },
          ],
        },
        {
          kind: 'fields',
          heading: 'Deductions & Tax',
          fields: [
            {
              label: 'Total Deductions',
              keys: ['total_deductions', 'deductions'],
              format: 'money',
            },
            { label: 'Taxable Income', keys: ['taxable_income'], format: 'money' },
            {
              label: 'Tax Payable',
              keys: ['total_tax', 'tax_payable', 'tax_liability', 'tax_on_taxable_income'],
              format: 'money',
            },
            {
              label: 'Tax Withheld',
              keys: ['tax_withheld', 'withholding', 'payg_withheld', 'federal_tax_withheld'],
              format: 'money',
            },
            {
              label: 'Refund',
              keys: ['refund', 'refund_amount', 'amount_refunded'],
              format: 'money',
            },
            {
              label: 'Amount Owed',
              keys: ['amount_owed', 'balance_due', 'amount_you_owe'],
              format: 'money',
            },
          ],
        },
      ],
    },
    { name: 'Schedules', blocks: [{ kind: 'remainingTables' }] },
  ],
};

/** Catch-all for ordinary documents: titles, every field, every table. */
export const DOCUMENT_SPEC: WorkbookSpec = {
  id: 'document',
  label: 'Document',
  sheets: [
    {
      name: 'Summary',
      blocks: [
        { kind: 'texts', heading: 'Titles', roles: ['title', 'heading'] },
        { kind: 'remainingFields', heading: 'Fields' },
      ],
    },
    { name: 'Tables', blocks: [{ kind: 'remainingTables' }] },
  ],
};

export const XLSX_PROFILES: WorkbookSpec[] = [
  INVOICE_SPEC,
  RECEIPT_SPEC,
  TAX_RETURN_SPEC,
  DOCUMENT_SPEC,
];
