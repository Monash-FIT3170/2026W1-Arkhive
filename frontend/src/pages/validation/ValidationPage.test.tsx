// This test file was generated with the assistance of Google Gemini.

//Mocks extraction service, upload service, ocr service, and child components to check for issues with our own logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ValidationPage from './ValidationPage';

// Mock dependencies
vi.mock('../../services/extractionService', () => ({
  getExtractionSession: vi.fn().mockResolvedValue([
    [{ _id: '1', text: 'Item 1' }]
  ]),
  saveExtractionSession: vi.fn(),
}));

vi.mock('../../services/uploadService', () => ({
  getUploadedImageUrl: vi.fn().mockResolvedValue('http://localhost/mock-image.png'),
  getProcessedImageUrls: vi.fn().mockResolvedValue(['http://localhost/mock-processed-image.png']),
}));

vi.mock('./components/extracted-data/detectReviewFields', () => ({
  detectReviewFields: vi.fn().mockReturnValue([]),
}));

vi.mock('./components/extracted-data/FlattenOcrData', () => ({
  flattenOcrData: vi.fn().mockReturnValue({
    columns: ['text'],
    rows: [{ _id: 'row1', text: 'Item 1' }]
  }),
}));

vi.mock('../../services/llmService', () => ({
  requestFieldReview: vi.fn(),
}));

// Mock child components
vi.mock('./components/document/DocumentPanel', () => ({
  default: () => <div data-testid="document-panel" />
}));

vi.mock('./components/extracted-data/ExtractedDataPanel', () => ({
  default: () => <div data-testid="extracted-data-panel" />
}));

vi.mock('./components/chat/ChatPanel', () => ({
  default: () => <div data-testid="chat-panel" />
}));
vi.mock('../../services/testService', () => ({
  getTestData: vi.fn().mockResolvedValue([
    [{ id: '1', type: 'TABLE_ROW', cells: ['A'], confidence: 0.9, boundingBoxes: {}, indentation: 0, y: 0, layer: 0, text: 'A' }]
  ]),
  getTestImageUrls: vi.fn().mockResolvedValue(['http://localhost/mock.png']),
}));

describe('ValidationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads session data on mount and renders panels', async () => {
    render(<ValidationPage />);

    // Wait for session data to be loaded (side effect in useEffect)
    await waitFor(() => {
      expect(screen.getByTestId('document-panel')).toBeInTheDocument();
      expect(screen.getByTestId('extracted-data-panel')).toBeInTheDocument();
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });
  });
});
