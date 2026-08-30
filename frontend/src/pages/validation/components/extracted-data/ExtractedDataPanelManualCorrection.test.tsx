import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import ExtractedDataPanel from './ExtractedDataPanel';
import type { ExtractedData } from '../../../../models/TableData';

// Unit test for ExtractedDataPanel
// Acknowledgment: The generation of these tests was done with the 
// assistance of Google Gemini

type PanelProps = ComponentProps<typeof ExtractedDataPanel>;

function ControlledPanel(props: PanelProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  return (
    <ExtractedDataPanel
      {...props}
      isEditMode={isEditMode}
      onEditModeChange={setIsEditMode}
    />
  );
}

function ReorderPanel(props: PanelProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [columns, setColumns] = useState<string[]>(props.extractedData.columns);
  return (
    <ExtractedDataPanel
      {...props}
      extractedData={{ ...props.extractedData, columns }}
      isEditMode={isEditMode}
      onEditModeChange={setIsEditMode}
      onColumnReorder={(newCols) => {
        props.onColumnReorder?.(newCols);
        setColumns(newCols);
      }}
    />
  );
}

const mockExtractedData: ExtractedData = {
  columns: ['Field1', 'Field2'],
  itemColumnKey: 'Field1',
  rows: [
    {
      _id: 'row1',
      _cellConfidence: { Field1: 0.9, Field2: 0.9 },
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
      <ControlledPanel
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

  it('turns a cell into an input field when clicked in edit mode', async () => {
    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    const cell = screen.getByText('Value1');
    fireEvent.click(cell);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('Value1');
  });

  it('saves edits via Enter key and shows success message', async () => {
    const user = userEvent.setup();
    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onCellEdit={onCellEditMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

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
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onCellEdit={onCellEditMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

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
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onCellEdit={onCellEditMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    fireEvent.click(screen.getByText('Value1'));
    const input = screen.getByRole('textbox');

    await user.clear(input);
    await user.type(input, 'WillBeDiscarded{Escape}');

    expect(onCellEditMock).not.toHaveBeenCalled();
    expect(screen.getByText('Changes discarded')).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Value1')).toBeDefined();
  });

  it('triggers onRowAdd when Add Row button is clicked', () => {
    const onRowAddMock = vi.fn();
    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onRowAdd={onRowAddMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    fireEvent.click(screen.getByText('Add Row'));
    expect(onRowAddMock).toHaveBeenCalledTimes(1);
  });

  it('triggers onRowDelete when row trash icon is clicked', () => {
    const onRowDeleteMock = vi.fn();
    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onRowDelete={onRowDeleteMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    // By title or somehow find the trash icon
    const deleteRowBtn = screen.getByTitle('Delete Row');
    fireEvent.click(deleteRowBtn);

    expect(onRowDeleteMock).toHaveBeenCalledWith('row1');
  });

  it('triggers onColumnAdd when Add Column is clicked and a name is provided', () => {
    const onColumnAddMock = vi.fn();

    // Mock the prompt
    vi.spyOn(window, 'prompt').mockReturnValue('New_Field');

    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onColumnAdd={onColumnAddMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    fireEvent.click(screen.getByText('Add Column'));
    expect(onColumnAddMock).toHaveBeenCalledWith('New_Field');

    vi.restoreAllMocks();
  });

  it('does not trigger onColumnAdd when prompt is cancelled', () => {
    const onColumnAddMock = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onColumnAdd={onColumnAddMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    fireEvent.click(screen.getByText('Add Column'));
    expect(onColumnAddMock).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('triggers onColumnDelete when column trash icon is clicked', () => {
    const onColumnDeleteMock = vi.fn();
    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onColumnDelete={onColumnDeleteMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    const deleteColBtns = screen.getAllByTitle('Delete Column');
    expect(deleteColBtns.length).toBe(2);

    fireEvent.click(deleteColBtns[0]);
    expect(onColumnDeleteMock).toHaveBeenCalledWith('Field1');
  });

  it('triggers onRowMove with up/down directions when move buttons are clicked', () => {
    const onRowMoveMock = vi.fn();
    render(
      <ControlledPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onRowMove={onRowMoveMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    const moveUpBtn = screen.getByTitle('Move Row Up');
    const moveDownBtn = screen.getByTitle('Move Row Down');

    fireEvent.click(moveUpBtn);
    expect(onRowMoveMock).toHaveBeenCalledWith('row1', 'up');

    fireEvent.click(moveDownBtn);
    expect(onRowMoveMock).toHaveBeenCalledWith('row1', 'down');
  });

  it('triggers onColumnReorder when columns are dragged', () => {
    const onColumnReorderMock = vi.fn();
    render(
      <ReorderPanel
        onHover={onHoverMock}
        extractedData={mockExtractedData}
        onColumnReorder={onColumnReorderMock}
      />
    );

    // Enable edit mode
    fireEvent.click(screen.getByTitle('Toggle Edit Mode'));

    let [firstHeader, secondHeader] = screen.getAllByRole('columnheader');

    fireEvent.dragStart(firstHeader);
    fireEvent.dragOver(secondHeader);
    fireEvent.drop(secondHeader);
    expect(onColumnReorderMock).toHaveBeenCalledWith(['Field2', 'Field1']);

    [firstHeader, secondHeader] = screen.getAllByRole('columnheader');

    fireEvent.dragStart(firstHeader);
    fireEvent.dragOver(secondHeader);
    fireEvent.drop(secondHeader);
    expect(onColumnReorderMock).toHaveBeenCalledWith(['Field1', 'Field2']);
  });
});
