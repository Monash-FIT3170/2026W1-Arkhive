import { useRef } from "react";
import type { ChangeEvent } from "react";
import { filterValidFiles } from "../dropzone/DropZone";

type UploadMoreButtonProps = {
  onFilesSelected: (files: File[]) => void;
};

function UploadMoreButton({ onFilesSelected }: UploadMoreButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleUploadMoreChange(event: ChangeEvent<HTMLInputElement>) {
    const validFiles = filterValidFiles(event.target.files);
    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        className="hidden"
        onChange={handleUploadMoreChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="h-[42px] cursor-pointer rounded-lg border border-[#3b3f4d] bg-[#1f2028] text-[15px] font-semibold text-gray-100 transition hover:bg-[#292b36]"
      >
        Upload More
      </button>
    </>
  );
}

export default UploadMoreButton;
