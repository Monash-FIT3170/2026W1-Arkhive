import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ValidationPage from './ValidationPage';

const { mockJobs } = vi.hoisted(() => ({
  mockJobs: [
    {
      id: 'job-1',
      index: 0,
      fileName: 'invoice-01.png',
      documentType: 'Invoice',
      imageIndex: 0,
      imageUrl: '/api/upload/image/0',
      status: 'completed',
      ocrData: [{ id: 'comp_1', text: 'Invoice #1', confidence: 0.95 } as any],
      confidence: 0.95,
      extractedData: { columns: ['ITEM', 'QTY'], rows: [{ _id: '1', ITEM: 'Paper', QTY: '5' }] },
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'job-2',
      index: 1,
      fileName: 'receipt-02.png',
      documentType: 'Receipt',
      imageIndex: 1,
      imageUrl: '/api/upload/image/1',
      status: 'completed',
      ocrData: [{ id: 'comp_2', text: 'Receipt #2', confidence: 0.88 } as any],
      confidence: 0.88,
      extractedData: {
        columns: ['ITEM', 'PRICE'],
        rows: [{ _id: '2', ITEM: 'Coffee', PRICE: '$4.50' }],
      },
      createdAt: 1000,
      updatedAt: 1000,
    },
  ],
}));

// Mock dependencies
vi.mock('../../services/extractionService', () => ({
  getExtractionSession: vi.fn().mockResolvedValue([[{ _id: '1', text: 'Item 1' }]]),
  getBatchJobs: vi.fn().mockResolvedValue({
    batchId: 'batch-123',
    activeJobIndex: 0,
    jobs: mockJobs,
  }),
  saveExtractionSession: vi.fn().mockResolvedValue({ success: true }),
  setActiveBatchJob: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../services/uploadService', () => ({
  getUploadedImageUrl: vi.fn().mockResolvedValue('http://localhost/mock-image.png'),
  getProcessedImageUrls: vi.fn().mockResolvedValue(['http://localhost/mock-processed-image.png']),
}));

vi.mock('./components/extracted-data/detectReviewFields', () => ({
  detectReviewFields: vi.fn().mockReturnValue([]),
}));

vi.mock('./components/extracted-data/flattener', () => ({
  flatten: vi.fn().mockReturnValue({
    columns: ['ITEM', 'QTY'],
    rows: [{ _id: 'row1', ITEM: 'Paper', QTY: '5' }],
  }),
}));

vi.mock('../../services/llmService', () => ({
  requestFieldReview: vi.fn(),
  requestFormatDetection: vi.fn().mockResolvedValue({}),
  requestBulkFieldReview: vi.fn().mockResolvedValue({}),
}));

// Mock child components
vi.mock('./components/document/DocumentPanel', () => ({
  default: ({ documentImageUrl }: any) => (
    <div data-testid="document-panel" data-src={documentImageUrl} />
  ),
}));

vi.mock('./components/extracted-data/ExtractedDataPanel', () => ({
  default: ({ extractedData }: any) => (
    <div data-testid="extracted-data-panel" data-columns={extractedData?.columns?.join(',')}>
      {extractedData?.rows?.map((r: any) => (
        <div key={r._id} data-testid={`row-${r._id}`}>
          {r.ITEM}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./components/chat/ChatPanel', () => ({
  default: () => <div data-testid="chat-panel" />,
}));
vi.mock('../../services/testService', () => ({
  getTestData: vi.fn().mockResolvedValue([
    [
      {
        id: '1',
        type: 'TABLE_ROW',
        cells: ['A'],
        confidence: 0.9,
        boundingBoxes: {},
        indentation: 0,
        y: 0,
        layer: 0,
        text: 'A',
      },
    ],
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

    // TODO: Commented out batch document tab tests as batch selector is currently disabled in ValidationPage.tsx
    /*
    expect(screen.getByText('invoice-01.png')).toBeInTheDocument();
    expect(screen.getByText('receipt-02.png')).toBeInTheDocument();
    expect(screen.getByText('Batch (2 Docs)')).toBeInTheDocument();
    */
  });

  // TODO: Commented out batch document job switching test as batch selector is currently disabled in ValidationPage.tsx
  /*
  it('switches between document jobs when clicking a tab', async () => {
    render(<ValidationPage />);

    await waitFor(() => {
      expect(screen.getByText('invoice-01.png')).toBeInTheDocument();
    });

    // Click second document tab
    fireEvent.click(screen.getByText('receipt-02.png'));

    await waitFor(() => {
      // Document panel should update to the second image
      expect(screen.getByTestId('document-panel')).toHaveAttribute(
        'data-src',
        '/api/upload/image/1'
      );
    });
  });
  */
});
