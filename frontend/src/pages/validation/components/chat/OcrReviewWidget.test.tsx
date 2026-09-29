import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OcrReviewWidget from './OcrReviewWidget';
import type { OcrIssue } from '../../../../models/IssueReview';

describe('OcrReviewWidget - Carousel Bubbles & Navigation', () => {
  const defaultProps = {
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onManualEdit: vi.fn(),
  };

  it('renders exactly 10 bubbles when there are 10 slides despite more unresolved issues due to grouping', () => {
    // 19 total issues, but 10 of them share a groupId -> results in 1 group slide + 9 single slides = 10 slides total
    const issues: OcrIssue[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        fieldId: `grouped-${i}`,
        fieldName: 'PRICE_LIST_WHITE',
        ocrValue: `val-${i}`,
        confidenceScore: 0.9,
        issueType: 'format' as const,
        rowId: i,
        groupId: 'price-group',
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        fieldId: `single-${i}`,
        fieldName: `FIELD_${i}`,
        ocrValue: `val-single-${i}`,
        confidenceScore: 0.5,
        issueType: 'confidence' as const,
        rowId: i + 10,
      })),
    ];

    expect(issues.length).toBe(19);

    render(<OcrReviewWidget {...defaultProps} issues={issues} />);

    // Check header text
    expect(screen.getByText('Issue 1 of 10')).toBeInTheDocument();

    // Verify there are exactly 10 carousel dot buttons, NOT 19
    const dots = screen.getAllByRole('button', { name: /Go to slide \d+/ });
    expect(dots).toHaveLength(10);

    // Slide 1 (index 0) dot should be active
    expect(dots[0]).toHaveClass('w-6', 'bg-primary');
    expect(dots[1]).toHaveClass('w-2', 'bg-base-300');

    // Navigate to slide 10 (issue 10 of 10)
    fireEvent.click(dots[9]);

    expect(screen.getByText('Issue 10 of 10')).toBeInTheDocument();

    // Dot 10 (index 9) is active, dots 0-8 are inactive, and there are NO dots after dot 10
    expect(dots[9]).toHaveClass('w-6', 'bg-primary');
    expect(dots[8]).toHaveClass('w-2', 'bg-base-300');
    expect(dots).toHaveLength(10);

    // Right chevron button should now be disabled
    const prevBtn = screen.getAllByRole('button').find((btn) => btn.querySelector('svg.lucide-chevron-left'));
    const forwardBtn = screen.getAllByRole('button').find((btn) => btn.querySelector('svg.lucide-chevron-right'));

    expect(forwardBtn).toBeDisabled();
    expect(prevBtn).not.toBeDisabled();
  });

  it('renders text indicator instead of bubbles when slides.length > 10', () => {
    const issues: OcrIssue[] = Array.from({ length: 12 }, (_, i) => ({
      fieldId: `single-${i}`,
      fieldName: `FIELD_${i}`,
      ocrValue: `val-${i}`,
      confidenceScore: 0.5,
      rowId: i,
    }));

    render(<OcrReviewWidget {...defaultProps} issues={issues} />);

    expect(screen.getByText('Issue 1 of 12')).toBeInTheDocument();
    expect(screen.getByText('1 / 12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Go to slide \d+/ })).toBeNull();
  });

  it('renders all clear when no unresolved issues', () => {
    render(<OcrReviewWidget {...defaultProps} issues={[]} />);
    expect(screen.getByText('All Clear!')).toBeInTheDocument();
  });
});
