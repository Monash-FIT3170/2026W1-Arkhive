import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PageSelectorProps = {
  pages: { pageIndex: number; label: string }[];
  selectedPageIndex: number | null;
  onChange: (pageIndex: number) => void;
};

function PageSelector({
  pages,
  selectedPageIndex,
  onChange
}: PageSelectorProps) {
  const currentPosition = pages.findIndex(
    (page) => page.pageIndex === selectedPageIndex
  );
  const pageNumber = currentPosition >= 0 ? currentPosition + 1 : 1;
  const [draft, setDraft] = useState(String(pageNumber));
  const hasPages = pages.length > 0;
  const hasMultiplePages = pages.length > 1;

  useEffect(() => {
    setDraft(String(pageNumber));
  }, [pageNumber]);

  const goToDisplayNumber = (nextNumber: number) => {
    if (!hasPages) return;
    const clamped = Math.min(pages.length, Math.max(1, Math.round(nextNumber)));
    const page = pages[clamped - 1];
    if (page && page.pageIndex !== selectedPageIndex) {
      onChange(page.pageIndex);
    }
    setDraft(String(clamped));
  };

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(pageNumber));
      return;
    }
    goToDisplayNumber(parsed);
  };

  return (
    <div className="flex items-center gap-1" aria-label="Page navigator">
      <button
        type="button"
        className="btn btn-sm btn-square"
        aria-label="Previous page"
        disabled={!hasMultiplePages || pageNumber <= 1}
        onClick={() => goToDisplayNumber(pageNumber - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Current page number"
        className="input input-bordered input-sm w-12 px-1 text-center"
        value={draft}
        disabled={!hasPages}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        className="btn btn-sm btn-square"
        aria-label="Next page"
        disabled={!hasMultiplePages || pageNumber >= pages.length}
        onClick={() => goToDisplayNumber(pageNumber + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="ml-1 text-sm text-base-content/60">
        / {pages.length || 1}
      </span>
    </div>
  );
}

export default PageSelector;
