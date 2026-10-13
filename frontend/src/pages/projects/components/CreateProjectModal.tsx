import { useState, useEffect, useRef } from 'react';
import { FolderPlus, X } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<unknown>;
  onError: (message: string) => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
  onError,
}: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    setErrorMsg(null);
    try {
      await onCreate(trimmed);
      setName('');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create project.';
      setErrorMsg(msg);
      onError(msg);
    } finally {
      setIsCreating(false);
    }
  }

  function handleCancel() {
    if (isCreating) return;
    setName('');
    setErrorMsg(null);
    onClose();
  }

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-md">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Create New Project</h3>
              <p className="text-xs text-base-content/60 mt-0.5">
                Organise your documents and scans in a dedicated workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
            onClick={handleCancel}
            disabled={isCreating}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="form-control w-full">
            <label htmlFor="project-name-input" className="label py-1">
              <span className="label-text text-xs font-medium">Project Name</span>
            </label>
            <input
              id="project-name-input"
              ref={inputRef}
              type="text"
              placeholder="e.g. Q1 Invoices, Tax Receipts 2026"
              className={`input input-bordered w-full ${errorMsg ? 'input-error' : ''}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleCancel();
              }}
              disabled={isCreating}
              maxLength={100}
            />
            {errorMsg && (
              <p className="text-xs text-error mt-1">{errorMsg}</p>
            )}
          </div>

          <div className="modal-action mt-4">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleCancel}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={isCreating || !name.trim()}
            >
              {isCreating ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={handleCancel} />
    </div>
  );
}
