import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import PreviewCard from "./components/grid/PreviewCard";
import SelectionActions from "./components/actions/SelectionActions";
import UploadMoreButton from "./components/actions/UploadMoreButton";
import ProcessDocumentsButton from "./components/actions/ProcessDocumentsButton";

function PreviewPage() {
  const location = useLocation();
  const [files, setFiles] = useState<File[]>(
    () => (location.state?.files as File[] | undefined) ?? []
  );
  const [selectedPages, setSelectedPages] = useState<Set<number>>(
    () => new Set(files.map((_, index) => index))
  );
  const previewItems = files.length > 0 ? files : Array.from({ length: 5 }, () => null);
  const filePreviews = useMemo(
    () =>
      files.map((file) => ({
        file,
        src: URL.createObjectURL(file),
        isImage: file.type.startsWith("image/"),
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      filePreviews.forEach((preview) => URL.revokeObjectURL(preview.src));
    };
  }, [filePreviews]);

  const previewMap = useMemo(
    () => new Map(filePreviews.map((preview) => [preview.file, preview])),
    [filePreviews]
  );

  useEffect(() => {
    setSelectedPages(new Set(files.map((_, index) => index)));
  }, [files]);

  function handleUploadMore(validFiles: File[]) {
    setFiles((previousFiles) => [...previousFiles, ...validFiles]);
  }

  function togglePageSelection(index: number) {
    setSelectedPages((previousSelection) => {
      const nextSelection = new Set(previousSelection);
      if (nextSelection.has(index)) {
        nextSelection.delete(index);
      } else {
        nextSelection.add(index);
      }
      return nextSelection;
    });
  }

  function selectAllPages() {
    setSelectedPages(new Set(files.map((_, index) => index)));
  }

  function deselectAllPages() {
    setSelectedPages(new Set());
  }

  return (
    <div className="fixed inset-0 z-10 flex h-screen w-screen flex-col bg-[#16171d] text-left text-gray-200">
      <header className="flex h-16 items-center border-b border-[#2e303a] bg-[#16171d] px-5 text-2xl font-bold text-gray-100">
        Preview
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <main className="flex-1 overflow-y-auto bg-[#16171d] p-5">
          <div className="grid auto-rows-auto grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-[18px] content-start">
            {previewItems.map((file, index) => (
              <PreviewCard
                key={`${file ? file.name : "placeholder"}-${index}`}
                file={file}
                index={index}
                isSelected={selectedPages.has(index)}
                previewSrc={file ? previewMap.get(file)?.src : undefined}
                isImage={file ? previewMap.get(file)?.isImage : undefined}
                onToggle={togglePageSelection}
              />
            ))}
          </div>
        </main>

        <aside className="flex w-[300px] flex-col gap-3 border-l border-[#2e303a] bg-[#16171d] px-4 py-6">
          <h2 className="m-0 text-center text-4xl font-semibold text-gray-100">Document Processing</h2>

          <SelectionActions
            onSelectAll={selectAllPages}
            onDeselectAll={deselectAllPages}
            selectedCount={selectedPages.size}
            totalCount={files.length}
          />
          <ProcessDocumentsButton />
          <UploadMoreButton onFilesSelected={handleUploadMore} />
        </aside>
      </div>
    </div>
  );
}

export default PreviewPage;