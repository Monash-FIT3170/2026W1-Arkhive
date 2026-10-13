import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportModal } from './ExportModal';
import * as planner from '../../../../services/export/planner';

describe('ExportModal Component', () => {
  const dummyExtractedData = {
    columns: ['Item', 'Quantity', 'Price'],
    rows: [
      { _id: '1', _cellConfidence: {}, Item: 'Widgets', Quantity: '5', Price: '10.00' },
    ],
    itemColumnKey: 'Item',
    fields: [
      { id: '1', key: 'invoice_number', label: 'Invoice No', value: 'INV-001', confidence: 0.99 },
      { id: '2', key: 'vendor', label: 'Vendor', value: 'Acme', confidence: 0.95 },
    ],
  };

  it('renders modal when isOpen is true with consolidated sections', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        extractedData={dummyExtractedData}
      />
    );

    expect(screen.getByText('Export Data')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('export')).toBeInTheDocument();
    expect(screen.getByText('Output Structure')).toBeInTheDocument();
    expect(screen.getByText('Export Scope')).toBeInTheDocument();
    expect(screen.getByText('Include Content')).toBeInTheDocument();
  });

  it('displays green Recommended badge on invoice template when invoice fields are detected', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        extractedData={dummyExtractedData}
        docType="invoice"
      />
    );

    // Green recommended badge should be visible
    const recommendedBadges = screen.getAllByText('Recommended');
    expect(recommendedBadges.length).toBeGreaterThan(0);
    expect(screen.getByText(/Detected: Invoice/i)).toBeInTheDocument();
  });

  it('displays all format sections (CSV, XLSX, JSON, TXT) with template cards', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        extractedData={dummyExtractedData}
      />
    );

    // Format badges should all be present
    expect(screen.getAllByText('CSV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('XLSX').length).toBeGreaterThan(0);
    expect(screen.getAllByText('JSON').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TXT').length).toBeGreaterThan(0);

    // Specialized CSV templates should be rendered
    expect(screen.getByText('Invoice Template')).toBeInTheDocument();
    expect(screen.getByText('Receipt Template')).toBeInTheDocument();
  });

  it('triggers deliver function when download button is clicked', () => {
    const deliverSpy = vi.spyOn(planner, 'deliver').mockImplementation(() => {});

    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        extractedData={dummyExtractedData}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    expect(deliverSpy).toHaveBeenCalled();
    deliverSpy.mockRestore();
  });

  it('shows bulk export confirmation when more than 5 pages or files are selected', () => {
    const multiPageFileGroup = {
      fileId: 'file-1',
      fileName: 'large_doc.pdf',
      averageConfidence: 0.9,
      pages: Array.from({ length: 6 }, (_, i) => ({
        pageIndexInFile: i,
        globalIndex: i,
        extractedPage: {
          pageIndex: i,
          columns: ['Col1'],
          rows: [{ _id: '1', _cellConfidence: {}, Col1: 'Val' }],
          itemColumnKey: 'Col1',
        },
        ocrComponents: [],
      })),
    };

    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        extractedData={dummyExtractedData}
        fileGroups={[multiPageFileGroup]}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    // Should open bulk confirmation dialog
    expect(screen.getByText('Bulk Export Download')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, download zip/i })).toBeInTheDocument();
  });

  it('opens cleanly without crashing or throwing ReferenceError when transitioning isOpen from false to true', () => {
    const { rerender } = render(
      <ExportModal
        isOpen={false}
        onClose={vi.fn()}
        extractedData={dummyExtractedData}
      />
    );

    // Modal initially closed
    expect(screen.queryByText('Export Data')).not.toBeInTheDocument();

    // Transition to open (simulating user clicking Export button in UI)
    rerender(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        extractedData={dummyExtractedData}
      />
    );

    expect(screen.getByText('Export Data')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('export')).toBeInTheDocument();
  });
});
