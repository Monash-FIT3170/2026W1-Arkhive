import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportModal } from './ExportModal';
import type { ExtractedData } from '../../../../models/TableData';

const mockExtractedData: ExtractedData = {
  columns: ['Col1', 'Col2'],
  rows: [
    { _id: '1', _confidence: 1, _cellConfidence: {}, Col1: 'A', Col2: 'B' },
  ],
  itemColumnKey: 'Col1',
};

describe('ExportModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ExportModal
        isOpen={false}
        onClose={vi.fn()}
        extractedData={mockExtractedData}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when isOpen is true', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        extractedData={mockExtractedData}
      />
    );
    expect(screen.getByText('Export Data')).toBeInTheDocument();
    expect(screen.getByText('All Pages')).toBeInTheDocument();
    expect(screen.getByText('Current Page')).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onCloseMock = vi.fn();
    render(
      <ExportModal
        isOpen={true}
        onClose={onCloseMock}
        extractedData={mockExtractedData}
      />
    );
    
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
