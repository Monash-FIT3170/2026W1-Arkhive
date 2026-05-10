type RawTextPanelProps = {
  rawText: string;
};

/**
 * RawTextPanel
 * A pure presentational component responsible strictly for displaying raw OCR text.
 * Built to satisfy the contract requirement of receiving `rawText` as a prop and
 * ensuring formatting such as line breaks are preserved (white-space: pre-wrap).
 * No API calls, session logic, or page-level integrations are included here.
 */
export default function RawTextPanel({ rawText }: RawTextPanelProps) {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
      {/* Panel Header */}
      <div className="border-b border-base-300 bg-base-200 px-4 py-3">
        <h2
          className="text-center font-semibold text-base-content"
          style={{ fontFamily: "'Manrope', sans-serif", fontSize: "20px" }}
        >
          Raw Text
        </h2>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {rawText ? (
          <pre
            className="whitespace-pre-wrap break-words leading-relaxed text-base-content"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: "16px" }}
          >
            {rawText}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-center opacity-40">
            <p
              className="text-base-content"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: "16px" }}
            >
              No raw text available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}