import { describe, it, expect } from 'vitest';
import type { ExtractedData } from '../models/TableData';
import { applyFieldMapping } from './fieldMapping';
import { FIELD_MAPPING_PRESETS } from './fieldMappingPresets';
import { buildExtractedDataXlsxBytes } from '../services/export/xlsxDownloadService';

function sampleData(): ExtractedData {
  return {
    columns: ['ITEM', 'QTY', 'PRICE', 'TOTAL'],
    itemColumnKey: 'ITEM',
    rows: [
      {
        _id: 'row_1',
        _cellConfidence: {},
        ITEM: 'Notebook A5',
        QTY: '2',
        PRICE: '$4.50',
        TOTAL: '$9.00',
      },
    ],
  };
}

// The xlsx writer stores its entries uncompressed, so the sheet text can be
// read straight from the file bytes.
function sheetText(data: ExtractedData): string {
  return new TextDecoder().decode(buildExtractedDataXlsxBytes(data));
}

describe('field mapping in the Excel export', () => {
  it('keeps the original column names when no mapping is applied', () => {
    const text = sheetText(sampleData());
    expect(text).toContain('ITEM');
    expect(text).not.toContain('Description');
  });

  it('writes the mapped column names and keeps the values', () => {
    const mapped = applyFieldMapping(sampleData(), FIELD_MAPPING_PRESETS.invoice);
    const text = sheetText(mapped);
    expect(text).toContain('Description');
    expect(text).toContain('Unit Price');
    expect(text).not.toContain('ITEM');
    expect(text).toContain('Notebook A5');
    expect(text).toContain('$4.50');
  });
});
