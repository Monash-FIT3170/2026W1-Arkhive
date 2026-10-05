// This test file was generated with the assistance of Google Gemini.

// Mocks react router, stepguard, upload service, and child components to check for issues with our own logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UploadPage from './UploadPage';

// Mock dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../services/stepGuard.ts', () => ({
  unlockStep: vi.fn(),
}));

vi.mock('./components/preview/previewHelpers', () => ({
  buildPreviewItemsForFiles: vi.fn().mockResolvedValue([
    { hasFile: true, label: 'Page 1', src: 'blob:mock-1' },
  ]),
}));

vi.mock('../../services/uploadService', () => ({
  uploadPageToBackend: vi.fn().mockResolvedValue(undefined),
  deletePageFromBackend: vi.fn().mockResolvedValue(undefined),
  processDocuments: vi.fn().mockResolvedValue(undefined),
  getUploadedDocuments: vi.fn().mockResolvedValue([]),
  getProcessedImageUrls: vi.fn().mockResolvedValue([]),
  getJobs: vi.fn().mockResolvedValue({ batchId: '', jobs: [] }),
}));

// Mock the child components to simplify testing the UploadPage logic
vi.mock('./components/EmptyUploadView', () => ({
  default: ({ onFilesCaptured }: any) => (
    <div data-testid="empty-view">
      <button onClick={() => onFilesCaptured([new File([], 'test.png')])}>Mock Drop</button>
    </div>
  ),
}));

vi.mock('./components/actions/UploadMoreButton', () => ({
  default: () => <div data-testid="upload-more" />,
}));

vi.mock('./components/preview/PreviewCard', () => ({
  default: ({ isSelected, onToggle, onRemove }: any) => (
    <div data-testid="preview-card">
      <span data-testid="selected-state">{isSelected ? 'selected' : 'unselected'}</span>
      <button onClick={() => onToggle()}>Toggle</button>
      <button onClick={() => onRemove()}>Remove</button>
    </div>
  ),
}));

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders EmptyUploadView initially', () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('empty-view')).toBeInTheDocument();
  });

  it('transitions to preview state and selects the page when files are added', async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );
    
    fireEvent.click(screen.getByText('Mock Drop'));

    await waitFor(() => {
      expect(screen.getByTestId('preview-card')).toBeInTheDocument();
    });

    expect(screen.getByTestId('selected-state')).toHaveTextContent('selected');
  });

  it('toggles selection when toggle button is clicked', async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );
    
    fireEvent.click(screen.getByText('Mock Drop'));

    await waitFor(() => {
      expect(screen.getByTestId('preview-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('selected-state')).toHaveTextContent('unselected');
    });
  });

});
