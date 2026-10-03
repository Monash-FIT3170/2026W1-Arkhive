import { useState } from 'react';
import { Plus } from 'lucide-react';

interface CreateProjectFormProps {
  onCreate: (name: string) => Promise<unknown>;
  onError: (message: string) => void;
}

export default function CreateProjectForm({ onCreate, onError }: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    try {
      await onCreate(trimmed);
      setName('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        placeholder="New project name"
        className="input input-bordered flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        disabled={isCreating}
      />
      <button
        className="btn btn-primary gap-1.5"
        onClick={handleCreate}
        disabled={isCreating || !name.trim()}
      >
        {isCreating ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Create
          </>
        )}
      </button>
    </div>
  );
}
