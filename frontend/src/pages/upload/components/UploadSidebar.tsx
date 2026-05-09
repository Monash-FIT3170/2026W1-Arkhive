// The right-hand panel shown in the loaded state.
// Composes three existing components that are left completely unchanged:
//   SelectionActions, UploadMoreButton, ProcessDocumentsButton
// To reorder, add, or remove sidebar sections, this is the only file to touch.

import SelectionActions       from '../../preview/components/actions/SelectionActions';
import ProcessDocumentsButton from '../../preview/components/actions/ProcessDocumentsButton';
import DropZone               from './dropzone/DropZone'; 

type Props = {
  selectedCount:   number;
  totalCount:      number;
  isProcessing:    boolean;
  onSelectAll:     () => void;
  onDeselectAll:   () => void;
  onProcess:       () => void;
  onFilesCaptured: (files: File[]) => void;
};

function UploadSidebar({
  selectedCount,
  totalCount,
  isProcessing,
  onSelectAll,
  onDeselectAll,
  onProcess,
  onFilesCaptured,
}: Props) {
  return (
    <aside className="border-base-300 bg-base-100 flex w-[300px] flex-col gap-4 border-l px-4 py-6">

      <h2 className="text-base-content m-0 text-center text-2xl font-semibold">
        Document Processing
      </h2>

      <div className="divider my-0" />

      <SelectionActions
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        selectedCount={selectedCount}
        totalCount={totalCount}
      />

      <div className="divider my-0" />

      {/* Mini dropzone — drag & drop or click to add more files */}
      <div>
        <p className="text-base-content/50 mb-2 text-xs font-medium uppercase tracking-wider">
          Add more files
        </p>
        <DropZone onFilesCaptured={onFilesCaptured} />
      </div>

      {/* Process button — pinned to the bottom */}
      <div className="mt-auto">
        <ProcessDocumentsButton
          selectedCount={selectedCount}
          isProcessing={isProcessing}
          onProcess={onProcess}
        />
      </div>

    </aside>
  );
}

export default UploadSidebar;