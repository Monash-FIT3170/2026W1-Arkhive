type Props = {
  selectedCount: number;
  isProcessing: boolean;
  onProcess: () => void;
};

export default function ProcessDocumentsButton({
  selectedCount,
  isProcessing,
  onProcess,
}: Props) {
  const isDisabled = selectedCount === 0 || isProcessing;

  return (
    <button
      type="button"
      onClick={onProcess}
      disabled={isDisabled}
      aria-busy={isProcessing}
      className="btn btn-primary mt-auto w-full rounded-xl text-base shadow-md"
    >
      {isProcessing ? (
        <>
          <span
            className="loading loading-spinner loading-sm"
            aria-hidden="true"
          />
          <span>Processing OCR…</span>
        </>
      ) : selectedCount > 0 ? (
        `Process ${selectedCount} Page${selectedCount !== 1 ? "s" : ""}`
      ) : (
        "Select pages to process"
      )}
    </button>
  );
}
