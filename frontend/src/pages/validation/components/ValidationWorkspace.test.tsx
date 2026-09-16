import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ValidationWorkspace from './ValidationWorkspace';
import type { ExtractedPage } from '../../../models/TableData';
import type { OCRComponent } from '../../../models/OCRComponent';

// Mock child panels that have heavy dependencies
vi.mock('./chat/ChatPanel', () => ({
  default: () => <div data-testid="chat-panel" />,
}));

vi.mock('../../../hooks/useReviewQueue', () => ({
  useReviewQueue: () => ({
    flaggedIssues: [],
    setFlaggedIssues: vi.fn(),
    resolvedIssueIds: new Set(),
    handleResolveIssues: vi.fn(),
    handleCarouselAccept: vi.fn(),
    handleCarouselReject: vi.fn(),
    handleCarouselManualEdit: vi.fn(),
    handleFetchSuggestion: vi.fn(),
    handleFetchBulkSuggestion: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useChat', () => ({
  useChatSuggestionFlow: () => ({
    messages: [],
    addMessage: vi.fn(),
    handleContextUpdate: vi.fn(),
    handleAccept: vi.fn(),
    handleReject: vi.fn(),
  }),
}));

describe('ValidationWorkspace - File Separation & Adaptive View Modes', () => {
  const mockPages: ExtractedPage[] = [
    { pageIndex: 0, columns: ['ITEM'], itemColumnKey: 'ITEM', rows: [{ _id: '1', ITEM: 'Item 1A', _cellConfidence: {} }] },
    { pageIndex: 1, columns: ['ITEM'], itemColumnKey: 'ITEM', rows: [{ _id: '2', ITEM: 'Item 1B', _cellConfidence: {} }] },
    { pageIndex: 2, columns: ['QTY'], itemColumnKey: 'QTY', rows: [{ _id: '3', QTY: 'Item 2A', _cellConfidence: {} }] },
  ];

  const mockOcrPages: OCRComponent[][] = [
    [{ id: 'c1', type: 'TABLE_ROW', indentation: 0, y: 0, layer: 0, text: 't1', confidence: 0.95 }],
    [{ id: 'c2', type: 'TABLE_ROW', indentation: 0, y: 0, layer: 0, text: 't2', confidence: 0.9 }],
    [{ id: 'c3', type: 'TABLE_ROW', indentation: 0, y: 0, layer: 0, text: 't3', confidence: 0.85 }],
  ];

  const mockImageUrls = ['http://img/1.png', 'http://img/2.png', 'http://img/3.png'];

  const mockFileMetadata = [
    { fileId: 'doc-1', fileName: 'Invoice_01.pdf', pageCount: 2 },
    { fileId: 'doc-2', fileName: 'Receipt_02.png', pageCount: 1 },
  ];

  const mockPersist = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with first file and scoped pages', () => {
    render(
      <ValidationWorkspace
        pages={mockPages}
        ocrPages={mockOcrPages}
        imageUrls={mockImageUrls}
        fileMetadata={mockFileMetadata}
        onPersist={mockPersist}
      />
    );

    // Should show active file name
    expect(screen.getByTestId('active-file-name')).toHaveTextContent('Invoice_01.pdf');
    // Should show file counter: (1/2)
    expect(screen.getByText('(1/2)')).toBeInTheDocument();
    // Dropdown should list files with page count badges
    expect(screen.getByText('2 pages')).toBeInTheDocument();
    expect(screen.getByText('1 page')).toBeInTheDocument();
    // Should show page 1 and page 2 buttons for the 2-page document
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    // Table should show Item 1A
    expect(screen.getByText('Item 1A')).toBeInTheDocument();
  });

  it('switches between files using Next File and Previous File buttons', () => {
    render(
      <ValidationWorkspace
        pages={mockPages}
        ocrPages={mockOcrPages}
        imageUrls={mockImageUrls}
        fileMetadata={mockFileMetadata}
        onPersist={mockPersist}
      />
    );

    const nextFileBtn = screen.getByRole('button', { name: 'Next File' });
    fireEvent.click(nextFileBtn);

    // Now File 2 is active
    expect(screen.getByTestId('active-file-name')).toHaveTextContent('Receipt_02.png');
    expect(screen.getByText('(2/2)')).toBeInTheDocument();
    // 1-page file displays "1 of 1" page indicator
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    // Table should display File 2 data
    expect(screen.getByText('Item 2A')).toBeInTheDocument();

    // Click Previous File button
    const prevFileBtn = screen.getByRole('button', { name: 'Previous File' });
    fireEvent.click(prevFileBtn);

    // Should switch back to File 1
    expect(screen.getByTestId('active-file-name')).toHaveTextContent('Invoice_01.pdf');
    expect(screen.getByText('Item 1A')).toBeInTheDocument();
  });

  it('switches pages within a multi-page file using page pill buttons', () => {
    render(
      <ValidationWorkspace
        pages={mockPages}
        ocrPages={mockOcrPages}
        imageUrls={mockImageUrls}
        fileMetadata={mockFileMetadata}
        onPersist={mockPersist}
      />
    );

    // Click page 2 button
    const page2Btn = screen.getByRole('button', { name: '2' });
    fireEvent.click(page2Btn);

    // Should now show Item 1B (page 2 of Invoice_01.pdf)
    expect(screen.getByText('Item 1B')).toBeInTheDocument();
  });

  it('toggles view modes: Split, Document, and Table', () => {
    render(
      <ValidationWorkspace
        pages={mockPages}
        ocrPages={mockOcrPages}
        imageUrls={mockImageUrls}
        fileMetadata={mockFileMetadata}
        onPersist={mockPersist}
      />
    );

    const docModeBtn = screen.getByTitle('Document Full Focus View');
    const tableModeBtn = screen.getByTitle('Table Full Focus View');
    const splitModeBtn = screen.getByTitle('Side-by-side Split View');

    // Click Table Focus Mode
    fireEvent.click(tableModeBtn);
    // In Table Mode, Table is visible and PiP preview is present
    expect(screen.getByText('EXTRACTED DATA')).toBeInTheDocument();
    expect(screen.getByText('Document Preview')).toBeInTheDocument();

    // Click Document Focus Mode
    fireEvent.click(docModeBtn);
    // In Document Mode, Table is not rendered
    expect(screen.queryByText('EXTRACTED DATA')).toBeNull();

    // Click Split Mode
    fireEvent.click(splitModeBtn);
    expect(screen.getByText('EXTRACTED DATA')).toBeInTheDocument();
  });
});
