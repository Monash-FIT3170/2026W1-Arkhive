import type { StructuredDocument } from '../../models/Document.js';

/**
 * Fixed OCR output returned when OCR_MODE=mock, instead of calling
 * Azure Document Intelligence + Gemini (analyse_result / structureDocument).
 *
 * Used by CI and frontend/backend integration tests, where real Azure/Gemini
 * credentials aren't available and a real network call would be flaky, slow,
 * and cost money on every run.
 */
export function getMockOcrResult(pageOffset = 0): StructuredDocument {
  return {
    docType: 'invoice',
    docTypeConfidence: 1,
    pages: [
      {
        pageIndex: pageOffset,
        blocks: [
          {
            kind: 'table',
            id: 'mock_t1',
            confidence: 0.97,
            columns: [
              { key: 'DESCRIPTION', label: 'Description' },
              { key: 'AMOUNT', label: 'Amount' },
            ],
            itemColumnKey: 'DESCRIPTION',
            rows: [
              {
                id: 'mock_t1_r1',
                level: 0,
                confidence: 0.97,
                cells: {
                  DESCRIPTION: { text: 'Invoice total', confidence: 0.97 },
                  AMOUNT: { text: '$42.00', confidence: 0.97 },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
