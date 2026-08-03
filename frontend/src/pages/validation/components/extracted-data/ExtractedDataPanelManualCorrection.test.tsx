import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExtractedDataPanel from './ExtractedDataPanel';
import type { ExtractedData } from '../../../../models/TableData';
import React from 'react';

// Unit test for ExtractedDataPanel
// Acknowledgment: The generation of these tests was done with the 
// assistance of Google Gemini

const mockExtractedData: ExtractedData = {
  columns: ['Field1', 'Field2'],
  rows: [
    {
      _id: 'row1',
      _confidence: 0.9,
      Field1: 'Value1',
      Field2: 'Value2',
    },
  ],
};

describe('ExtractedDataPanel - Manual Correction', () => {
  const onHoverMock = vi.fn();
  const onCellEditMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the table data correctly', () => {
    render(
      <ExtractedDataPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
      />
    );
    expect(screen.getByText('EXTRACTED DATA')).toBeDefined();
    expect(screen.getByText('Field1')).toBeDefined();
    expect(screen.getByText('Field2')).toBeDefined();
    expect(screen.getByText('Value1')).toBeDefined();
    expect(screen.getByText('Value2')).toBeDefined();
  });

  it('turns a cell into an input field when clicked', async () => {
    render(
      <ExtractedDataPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
      />
    );
    
    const cell = screen.getByText('Value1');
    fireEvent.click(cell);
    
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('Value1');
  });

  it('saves edits via Enter key and shows success message', async () => {
    const user = userEvent.setup();
    render(
      <ExtractedDataPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onCellEdit={onCellEditMock}
      />
    );
    
    fireEvent.click(screen.getByText('Value1'));
    const input = screen.getByRole('textbox');
    
    await user.clear(input);
    await user.type(input, 'NewValue1{Enter}');
    
    expect(onCellEditMock).toHaveBeenCalledWith('row1:Field1', 'NewValue1');
    expect(screen.getByText('Success, changes saved!')).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('NewValue1')).toBeDefined();
  });

  it('saves edits when clicking outside (onBlur)', async () => {
    const user = userEvent.setup();
    render(
      <ExtractedDataPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onCellEdit={onCellEditMock}
      />
    );
    
    fireEvent.click(screen.getByText('Value1'));
    const input = screen.getByRole('textbox');
    
    await user.clear(input);
    await user.type(input, 'AnotherValue');
    fireEvent.blur(input);
    
    expect(onCellEditMock).toHaveBeenCalledWith('row1:Field1', 'AnotherValue');
    expect(screen.getByText('Success, changes saved!')).toBeDefined();
  });

  it('discards edits when pressing Escape', async () => {
    const user = userEvent.setup();
    render(
      <ExtractedDataPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onCellEdit={onCellEditMock}
      />
    );
    
    fireEvent.click(screen.getByText('Value1'));
    const input = screen.getByRole('textbox');
    
    await user.clear(input);
    await user.type(input, 'WillBeDiscarded{Escape}');
    
    expect(onCellEditMock).not.toHaveBeenCalled();
    expect(screen.getByText('Changes discarded')).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Value1')).toBeDefined();
  });
});
