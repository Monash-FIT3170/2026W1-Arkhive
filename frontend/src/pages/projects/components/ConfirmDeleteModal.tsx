interface ConfirmDeleteModalProps {
  title: string;
  description: string;
  isLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Generic enough to reuse anywhere a "this permanently deletes X" modal is
 * needed (e.g. the workspace page's page/bulk-delete confirms) — it has no
 * knowledge of projects specifically.
 */
export default function ConfirmDeleteModal({
  title,
  description,
  isLoading,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  return (
    <div className="modal modal-open z-50">
      <div className="modal-box">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="py-4 text-sm">{description}</p>
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
          <button className="btn btn-error" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? <span className="loading loading-spinner loading-sm" /> : 'Delete'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onCancel} />
    </div>
  );
}
