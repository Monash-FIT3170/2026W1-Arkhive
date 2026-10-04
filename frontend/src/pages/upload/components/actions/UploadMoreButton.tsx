import { useRef } from "react";
import type { ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { filterValidFiles, partitionBySize, MAX_FILE_SIZE_MB } from "../dropzone/dropZoneUtils";

type UploadMoreButtonProps = {
  onFilesSelected: (files: File[]) => void;
  onError?: (msg: string) => void;
};

function UploadMoreButton({ onFilesSelected, onError }: UploadMoreButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleUploadMoreChange(event: ChangeEvent<HTMLInputElement>) {
    const validFiles = filterValidFiles(event.target.files);
    const { accepted, rejected } = partitionBySize(validFiles);
    
    if (rejected.length > 0 && onError) {
      onError(`One or more files exceed the ${MAX_FILE_SIZE_MB}MB limit.`);
    }

    if (accepted.length > 0) {
      onFilesSelected(accepted);
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
        className="btn btn-sm btn-outline gap-1.5"
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5" />
        Upload More
      </button>
    </>
  );
}

export default UploadMoreButton;
