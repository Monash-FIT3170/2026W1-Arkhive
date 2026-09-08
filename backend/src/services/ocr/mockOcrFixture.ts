import { OCRComponent } from './types/boundingBoxTypes';

/**
 * Fixed OCR output returned when OCR_MODE=mock, instead of calling
 * Azure Document Intelligence + Gemini (analyse_result / mapOCRtoPages).
 *
 * Used by CI and frontend/backend integration tests, where real
 * Azure/Gemini credentials aren't available and a real network call
 * would be flaky, slow, and cost money on every run.
 */
export function getMockOcrResult(): OCRComponent[] {
  return [
    {
      id: 'comp_1',
      type: 'TABLE_ROW',
      indentation: 0,
      y: 0,
      layer: 0,
      text: 'Invoice total',
      cells: ['Invoice total', '$42.00'],
      confidence: 0.97,
    },
  ];
}
