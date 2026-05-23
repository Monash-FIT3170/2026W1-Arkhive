type Props = {
  selectedCount: number;
  isProcessing: boolean;
  onProcess: () => void;
};

function ProcessDocumentsButton({ selectedCount, isProcessing, onProcess }: Props) {
  const isDisabled = selectedCount === 0 || isProcessing;

  return (
    <button
      type="button"
      onClick={onProcess}
      disabled={isDisabled}
      className="btn btn-primary mt-auto w-full rounded-xl text-base shadow-md"
    >
      {isProcessing
        ? 'Processing…'
        : selectedCount > 0
          ? `Process ${selectedCount} Page${selectedCount !== 1 ? 's' : ''}`
          : 'Select pages to process'}
    </button>
  );
}

export default ProcessDocumentsButton;