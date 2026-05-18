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
      className={`
        mt-auto h-12 rounded-[10px] border-none text-lg font-bold text-white transition
        ${isDisabled
          ? 'cursor-not-allowed bg-red-500/40 text-white/50'
          : 'cursor-pointer bg-red-500 hover:bg-red-600'}
      `}
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