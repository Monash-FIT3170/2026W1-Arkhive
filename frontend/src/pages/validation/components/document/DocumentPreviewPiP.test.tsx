import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentPreviewPiP from './DocumentPreviewPiP';

// Mock DocumentPanel since it has canvas/pdf dependencies
vi.mock('./DocumentPanel', () => ({
  default: () => <div data-testid="mock-document-panel">Mock Document Panel</div>,
}));

describe('DocumentPreviewPiP', () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with title and Close button without Expand button', () => {
    render(
      <DocumentPreviewPiP
        documentImageUrl="http://example.com/test.jpg"
        ocrData={[]}
        currentPageIndex={0}
        hoveredOverlayIds={[]}
        onClose={onCloseMock}
      />
    );

    expect(screen.getByText('Document Preview')).toBeInTheDocument();
    expect(screen.queryByText('Expand')).toBeNull();
    expect(screen.getByRole('button', { name: '✕' })).toBeInTheDocument();
    expect(screen.getByTestId('mock-document-panel')).toBeInTheDocument();
  });

  it('triggers onClose when Close button is clicked', () => {
    render(
      <DocumentPreviewPiP
        documentImageUrl={null}
        ocrData={[]}
        currentPageIndex={0}
        hoveredOverlayIds={[]}
        onClose={onCloseMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('updates position when dragged via header', () => {
    render(
      <DocumentPreviewPiP
        documentImageUrl={null}
        ocrData={[]}
        currentPageIndex={0}
        hoveredOverlayIds={[]}
        onClose={onCloseMock}
      />
    );

    const modal = screen.getByTestId('pip-document-preview-modal');
    const header = screen.getByTitle('Click and drag to move preview');

    // Initial style is bottom: 1rem, left: 1rem
    expect(modal.style.left).toBe('1rem');
    expect(modal.style.bottom).toBe('1rem');

    // Simulate drag
    fireEvent.mouseDown(header, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 130 });
    fireEvent.mouseUp(window);

    // After drag, position is explicit pixel coords
    expect(modal.style.left).toBeDefined();
    expect(modal.style.top).toBeDefined();
  });

  it('updates size when resized via corner handle', () => {
    render(
      <DocumentPreviewPiP
        documentImageUrl={null}
        ocrData={[]}
        currentPageIndex={0}
        hoveredOverlayIds={[]}
        onClose={onCloseMock}
      />
    );

    const modal = screen.getByTestId('pip-document-preview-modal');
    // Initial size is 320x224
    expect(modal.style.width).toBe('320px');
    expect(modal.style.height).toBe('224px');

    const resizeHandles = screen.getAllByTitle('Resize');
    const seHandle = resizeHandles[3]; // bottom-right corner

    fireEvent.mouseDown(seHandle, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 250, clientY: 260 });
    fireEvent.mouseUp(window);

    expect(parseInt(modal.style.width, 10)).toBeGreaterThan(320);
    expect(parseInt(modal.style.height, 10)).toBeGreaterThan(224);
  });

  it('respects minimum size constraints during resize', () => {
    render(
      <DocumentPreviewPiP
        documentImageUrl={null}
        ocrData={[]}
        currentPageIndex={0}
        hoveredOverlayIds={[]}
        onClose={onCloseMock}
      />
    );

    const modal = screen.getByTestId('pip-document-preview-modal');
    const resizeHandles = screen.getAllByTitle('Resize');
    const seHandle = resizeHandles[3]; // bottom-right

    // Drag far to the top-left to attempt making it tiny
    fireEvent.mouseDown(seHandle, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(window);

    // Should be clamped to MIN_WIDTH (240px) and MIN_HEIGHT (160px)
    expect(parseInt(modal.style.width, 10)).toBe(240);
    expect(parseInt(modal.style.height, 10)).toBe(160);
  });
});
