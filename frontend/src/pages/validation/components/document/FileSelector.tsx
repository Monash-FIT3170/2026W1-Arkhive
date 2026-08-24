import type { UploadedFileGroup } from "../../../../models/UploadedFileGroup";
import { formatFileOptionLabel } from "./validationFileHelpers";

type FileSelectorProps = {
  files: UploadedFileGroup[];
  selectedFileIndex: number | null;
  onChange: (fileIndex: number) => void;
};

function FileSelector({
  files,
  selectedFileIndex,
  onChange
}: FileSelectorProps) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="text-sm font-medium text-base-content/70">File</span>
      <select
        aria-label="Select file to validate"
        className="select select-bordered select-sm min-w-0 max-w-56"
        value={selectedFileIndex ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={files.length === 0}
      >
        {files.length === 0 && <option value="">No files available</option>}
        {files.map((file, index) => (
          <option key={file.fileIndex} value={file.fileIndex}>
            {formatFileOptionLabel(file.fileName, index + 1)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default FileSelector;
