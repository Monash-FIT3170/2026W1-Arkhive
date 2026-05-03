import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterValidFiles } from "../upload/components/dropzone/DropZone";

function PreviewPage() {
  const location = useLocation();
  const [files, setFiles] = useState<File[]>(
    () => (location.state?.files as File[] | undefined) ?? []
  );
  const uploadMoreInputRef = useRef<HTMLInputElement>(null);
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

  function handleUploadMoreChange(event: React.ChangeEvent<HTMLInputElement>) {
    const validFiles = filterValidFiles(event.target.files);
    if (validFiles.length > 0) {
      setFiles((previousFiles) => [...previousFiles, ...validFiles]);
    }

    if (uploadMoreInputRef.current) {
      uploadMoreInputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex h-screen w-screen flex-col bg-[#16171d] text-left text-gray-200">
      <input
        ref={uploadMoreInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        className="hidden"
        onChange={handleUploadMoreChange}
      />

      <header className="flex h-16 items-center border-b border-[#2e303a] bg-[#16171d] px-5 text-2xl font-bold text-gray-100">
        Preview
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <main className="flex-1 overflow-y-auto bg-[#16171d] p-5">
          <div className="grid auto-rows-auto grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-[18px] content-start">
            {previewItems.map((file, index) => (
              <article
                key={`${file ? file.name : "placeholder"}-${index}`}
                className="relative min-h-[220px] rounded-[10px] border border-[#2e303a] bg-[#1f2028] p-3"
              >
                <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
                  ✓
                </span>

                <div className="mx-auto mb-[10px] mt-4 h-[150px] w-[108px] overflow-hidden rounded-[2px] border border-[#3f4350] bg-[#f8fafc] shadow-[inset_0_0_0_1px_#e5e7eb]">
                  {file && previewMap.get(file)?.isImage ? (
                    <img
                      src={previewMap.get(file)?.src}
                      alt={file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : file ? (
                    <div className="flex h-full w-full items-center justify-center text-center text-xs font-semibold text-gray-500">
                      Preview unavailable
                    </div>
                  ) : null}
                </div>

                <div>
                  <p className="truncate text-center text-xs text-gray-300">
                    {file ? file.name : `Page ${index + 1}`}
                  </p>
                  <p className="mt-1.5 text-center text-xs text-gray-400">{index + 1}</p>
                </div>
              </article>
            ))}
          </div>
        </main>

        <aside className="flex w-[300px] flex-col gap-3 border-l border-[#2e303a] bg-[#16171d] px-4 py-6">
          <h2 className="m-0 text-center text-4xl font-semibold text-gray-100">Document Processing</h2>

          <p className="mb-1 mt-2 text-base font-semibold text-gray-200">Extract mode:</p>
          <button
            type="button"
            className="h-[42px] cursor-pointer rounded-lg border border-[#3b3f4d] bg-[#1f2028] text-[15px] font-semibold text-gray-100 transition hover:bg-[#292b36]"
          >
            Select All Documents 
          </button>
          <button
            type="button"
            className="h-[42px] cursor-pointer rounded-lg border border-[#3b3f4d] bg-[#1f2028] text-[15px] font-semibold text-gray-100 transition hover:bg-[#292b36]"
          >
            Deselect All Documents 
          </button>

          <div className="rounded-lg border border-[#2f3d59] bg-[#1a2638] p-2.5 text-[13px] leading-[1.4] text-gray-200">
            {files.length > 0
              ? `${files.length} uploaded file(s) detected. Pages will be processed in the next step.`
              : "No uploaded files detected yet. Upload files to generate page previews."}
          </div>

          <button
            type="button"
            className="mt-auto h-12 cursor-pointer rounded-[10px] border-none bg-red-500 text-lg font-bold text-white transition hover:bg-red-600"
          >
            Proccess Documents
          </button>

          <button
            type="button"
            onClick={() => uploadMoreInputRef.current?.click()}
            className="h-[42px] cursor-pointer rounded-lg border border-[#3b3f4d] bg-[#1f2028] text-[15px] font-semibold text-gray-100 transition hover:bg-[#292b36]"
          >
            Upload More
          </button>
        </aside>
      </div>
    </div>
  );
}

export default PreviewPage;