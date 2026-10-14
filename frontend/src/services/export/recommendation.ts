import type { ExtractedData, ExtractedPage } from '../../models/TableData';
import type { ValidationFileGroup } from '../../utils/fileGrouping';
import { normKey } from './model';
import type { ExportFormat } from './templates';

export type TemplateCategory = 'invoice' | 'receipt' | 'form' | 'default';

export interface RecommendationResult {
  category: TemplateCategory;
  recommendedTemplateIds: Set<string>;
  reason: string;
  getRecommendedIdForFormat: (format: ExportFormat) => string;
}

// Distinct B2B Invoice keys (rarely or never found on retail receipts)
const DISTINCT_INVOICE_KEYS = [
  'duedate',
  'paymentdue',
  'paymentduedate',
  'ponumber',
  'purchaseorder',
  'po',
  'billto',
  'billingaddress',
  'shipto',
  'shippingaddress',
  'paymentterms',
  'terms',
  'net30',
  'net15',
  'remitto',
  'clientname',
  'client',
];

const INVOICE_NUMBER_KEYS = [
  'invoicenumber',
  'invoiceno',
  'invoiceid',
  'invoicenum',
  'invoice',
];

// Distinct retail receipt keys
const DISTINCT_RECEIPT_KEYS = [
  'merchant',
  'merchantname',
  'store',
  'storename',
  'storenumber',
  'shop',
  'retailer',
  'receiptnumber',
  'receiptno',
  'receipt',
  'receiptid',
  'docket',
  'docketnumber',
  'register',
  'registernumber',
  'cashier',
  'terminal',
  'transactionid',
  'transno',
  'transaction',
  'paymentmethod',
  'paymenttype',
  'cardtype',
  'cardnumber',
  'tender',
  'tendered',
  'change',
  'changedue',
  'cash',
  'eftpos',
  'visa',
  'mastercard',
  'tip',
  'gratuity',
  'order',
  'ordernumber',
  'orderno',
  'itemsold',
  'itemscount',
  'amountpaid',
];

// Shared transaction keys (present on both receipts and invoices)
const SHARED_TRANSACTION_KEYS = [
  'subtotal',
  'tax',
  'gst',
  'vat',
  'total',
  'totalamount',
  'vendor',
  'vendorname',
  'date',
  'time',
  'amountdue',
];

const FORM_FIELD_KEYS = [
  'taxpayer',
  'taxpayername',
  'tin',
  'ssn',
  'tfn',
  'taxyear',
  'financialyear',
  'filingstatus',
  'wages',
  'salary',
  'interest',
  'dividends',
  'deductions',
  'totaldeductions',
  'taxableincome',
  'taxpayable',
  'taxwithheld',
  'refund',
  'amountowed',
  'applicant',
  'dob',
];

export interface RecommendInput {
  docType?: string;
  extractedData?: ExtractedData & Partial<ExtractedPage>;
  fileGroups?: ValidationFileGroup[];
}

export function recommendTemplate(input: RecommendInput): RecommendationResult {
  const scores: Record<TemplateCategory, number> = {
    invoice: 0,
    receipt: 0,
    form: 0,
    default: 10, // baseline for generic tables/documents
  };

  // 1. Direct classification boost from OCR / LlamaCloud
  const dt = input.docType?.toLowerCase();
  if (dt === 'receipt') {
    scores.receipt += 100;
  } else if (dt === 'invoice') {
    scores.invoice += 100;
  } else if (dt === 'form' || dt === 'tax_return') {
    scores.form += 100;
  } else if (dt === 'table') {
    scores.default += 100;
  }

  // 2. Scan pages for texts, fields, tables, and raw content
  const pagesToScan: Partial<ExtractedPage>[] = [];
  const fileNames: string[] = [];

  if (input.fileGroups && input.fileGroups.length > 0) {
    for (const group of input.fileGroups) {
      if (group.fileName) fileNames.push(group.fileName.toLowerCase());
      for (const pageItem of group.pages) {
        if (pageItem.extractedPage) pagesToScan.push(pageItem.extractedPage);
      }
    }
  } else if (input.extractedData) {
    pagesToScan.push(input.extractedData);
  }

  // Check file names for explicit naming hints
  for (const fn of fileNames) {
    if (fn.includes('receipt')) scores.receipt += 50;
    if (fn.includes('invoice')) scores.invoice += 50;
    if (fn.includes('table') || fn.includes('sheet')) scores.default += 50;
  }

  const allFieldKeys: string[] = [];
  const allFieldLabels: string[] = [];
  const allStrings: string[] = [];
  let tableRowsCount = 0;
  let tableColumnsCount = 0;
  let hasTables = false;

  for (const page of pagesToScan) {
    if (page.fields) {
      for (const f of page.fields) {
        if (f.key) {
          allFieldKeys.push(normKey(f.key));
          allStrings.push(f.key);
        }
        if (f.label) {
          allFieldLabels.push(normKey(f.label));
          allStrings.push(f.label);
        }
        if (f.value !== undefined && f.value !== null) {
          allStrings.push(String(f.value));
        }
      }
    }
    if (page.texts) {
      for (const t of page.texts) {
        if (t.text) allStrings.push(t.text);
      }
    }
    if (page.columns && page.columns.length > 0) {
      hasTables = true;
      tableColumnsCount = Math.max(tableColumnsCount, page.columns.length);
      tableRowsCount += page.rows?.length || 0;
      for (const col of page.columns) {
        if (col) allStrings.push(col);
      }
    }
    if (page.rows) {
      for (const row of page.rows) {
        for (const [k, v] of Object.entries(row)) {
          if (!k.startsWith('_') && v !== undefined && v !== null) {
            allStrings.push(String(v));
          }
        }
      }
    }
    if (page.otherTables) {
      for (const t of page.otherTables) {
        hasTables = true;
        tableColumnsCount = Math.max(tableColumnsCount, t.columns?.length || 0);
        tableRowsCount += t.rows?.length || 0;
        if (t.columns) {
          for (const col of t.columns) if (col) allStrings.push(col);
        }
        if (t.rows) {
          for (const row of t.rows) {
            for (const [k, v] of Object.entries(row)) {
              if (!k.startsWith('_') && v !== undefined && v !== null) {
                allStrings.push(String(v));
              }
            }
          }
        }
      }
    }
  }

  // Combined full extracted text lowercase
  const fullExtractedText = [...fileNames, ...allStrings].join(' ').toLowerCase();

  // 3. Explicit word occurrences check for "invoice" and "receipt"
  const invoiceWordMatches =
    fullExtractedText.match(/\b(invoice|invoices|tax\s+invoice|commercial\s+invoice|proforma\s+invoice)\b/gi) || [];
  const receiptWordMatches =
    fullExtractedText.match(/\b(receipt|receipts|sales\s+receipt|tax\s+receipt|cash\s+receipt|customer\s+receipt)\b/gi) || [];

  const hasInvoiceWord = invoiceWordMatches.length > 0;
  const hasReceiptWord = receiptWordMatches.length > 0;

  // Contextual retail vs B2B signals
  const hasRetailClues =
    /\b(register|terminal|cashier|docket|eftpos|tender|tendered|change\s+due|pos\b|store\s*#|reg\s*#)\b/i.test(
      fullExtractedText
    );
  const hasB2BInvoiceClues =
    /\b(bill\s+to|billing\s+address|remit\s+to|due\s+date|payment\s+due|purchase\s+order|po\s+number|p\.o\.|payment\s+terms|net\s*30|net\s*15|net\s*60)\b/i.test(
      fullExtractedText
    );

  if (hasInvoiceWord) {
    scores.invoice += Math.min(invoiceWordMatches.length * 25, 75);
  }
  if (hasReceiptWord) {
    scores.receipt += Math.min(receiptWordMatches.length * 25, 75);
  }
  if (hasRetailClues) {
    scores.receipt += 40;
  }
  if (hasB2BInvoiceClues) {
    scores.invoice += 40;
  }

  // If "invoice" word appears and no retail indicators exist, strong invoice preference
  if (hasInvoiceWord && !hasReceiptWord && !hasRetailClues) {
    scores.invoice += 40;
  }
  // If "receipt" word appears and no B2B indicators exist, strong receipt preference
  if (hasReceiptWord && !hasInvoiceWord && !hasB2BInvoiceClues) {
    scores.receipt += 40;
  }

  if (/\b(tax\s+return|form\s+1040|w-2|taxpayer|financial\s+year|filing\s+status|deductions)\b/i.test(fullExtractedText)) {
    scores.form += 50;
  }

  // 4. Tabular structure baseline
  // Only boost generic table if neither invoice nor receipt words/clues were found.
  // Invoices and receipts almost always have line item tables!
  if (hasTables && tableColumnsCount >= 2 && !hasInvoiceWord && !hasReceiptWord && !hasRetailClues && !hasB2BInvoiceClues) {
    scores.default += 35;
    if (tableRowsCount >= 2) {
      scores.default += 20;
    }
  }

  // 5. Match field keys & labels
  const allTokens = [...allFieldKeys, ...allFieldLabels];
  let distinctReceiptHits = 0;
  let distinctInvoiceHits = 0;
  let invoiceNumberHits = 0;
  let sharedTransactionHits = 0;

  for (const key of allTokens) {
    if (DISTINCT_RECEIPT_KEYS.includes(key)) {
      scores.receipt += 25;
      distinctReceiptHits++;
    }
    if (DISTINCT_INVOICE_KEYS.includes(key)) {
      scores.invoice += 25;
      distinctInvoiceHits++;
    }
    if (INVOICE_NUMBER_KEYS.includes(key)) {
      invoiceNumberHits++;
    }
    if (SHARED_TRANSACTION_KEYS.includes(key)) {
      sharedTransactionHits++;
    }
    if (FORM_FIELD_KEYS.includes(key)) {
      scores.form += 25;
    }
  }

  // Handle invoice number keys
  if (invoiceNumberHits > 0) {
    if (hasReceiptWord || hasRetailClues || distinctReceiptHits > 0) {
      // Mislabeled receipt docket/number by OCR: lean receipt
      scores.receipt += 20;
    } else {
      scores.invoice += 35;
    }
  }

  // Handle shared transaction keys (vendor, total, subtotal, tax, date)
  if (sharedTransactionHits > 0) {
    if (hasInvoiceWord || hasB2BInvoiceClues || distinctInvoiceHits > 0 || (invoiceNumberHits > 0 && !hasReceiptWord)) {
      scores.invoice += sharedTransactionHits * 10;
    } else if (hasReceiptWord || hasRetailClues || distinctReceiptHits > 0) {
      scores.receipt += sharedTransactionHits * 10;
    } else if (hasTables && tableRowsCount >= 2) {
      scores.default += 15;
    } else {
      scores.default += 10;
    }
  }

  // If receipt signals are present and NO invoice signals exist, boost receipt
  if ((distinctReceiptHits > 0 || hasRetailClues || hasReceiptWord) && !hasInvoiceWord && !hasB2BInvoiceClues && distinctInvoiceHits === 0) {
    scores.receipt += 30;
  }

  // If invoice signals are present and NO receipt signals exist, boost invoice
  if ((distinctInvoiceHits > 0 || hasB2BInvoiceClues || hasInvoiceWord) && !hasReceiptWord && !hasRetailClues && distinctReceiptHits === 0) {
    scores.invoice += 30;
  }

  // 6. Determine winning category
  let bestCategory: TemplateCategory = 'default';
  let highestScore = scores.default;

  const categories: TemplateCategory[] = ['receipt', 'invoice', 'form', 'default'];
  for (const cat of categories) {
    if (scores[cat] > highestScore) {
      highestScore = scores[cat];
      bestCategory = cat;
    }
  }

  // 7. Map winning category to template IDs
  const recommendedTemplateIds = new Set<string>();
  if (bestCategory === 'receipt') {
    recommendedTemplateIds.add('csv.receipt');
    recommendedTemplateIds.add('xlsx.receipt');
  } else if (bestCategory === 'invoice') {
    recommendedTemplateIds.add('csv.invoice');
    recommendedTemplateIds.add('xlsx.invoice');
  } else if (bestCategory === 'form') {
    recommendedTemplateIds.add('csv.form');
    recommendedTemplateIds.add('xlsx.tax_return');
  } else {
    recommendedTemplateIds.add('csv.default');
    recommendedTemplateIds.add('xlsx.default');
  }

  // Short, clean reason
  const reason =
    bestCategory === 'receipt'
      ? 'Detected receipt'
      : bestCategory === 'invoice'
        ? 'Detected invoice'
        : bestCategory === 'form'
          ? 'Detected form'
          : 'Detected table';

  const getRecommendedIdForFormat = (format: ExportFormat): string => {
    switch (format) {
      case 'csv':
        return bestCategory === 'receipt'
          ? 'csv.receipt'
          : bestCategory === 'invoice'
            ? 'csv.invoice'
            : bestCategory === 'form'
              ? 'csv.form'
              : 'csv.default';
      case 'xlsx':
        return bestCategory === 'receipt'
          ? 'xlsx.receipt'
          : bestCategory === 'invoice'
            ? 'xlsx.invoice'
            : bestCategory === 'form'
              ? 'xlsx.tax_return'
              : 'xlsx.default';
      case 'json':
        return 'json.default';
      case 'txt':
        return 'txt.default';
    }
  };

  return {
    category: bestCategory,
    recommendedTemplateIds,
    reason,
    getRecommendedIdForFormat,
  };
}
