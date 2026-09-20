import { useNavigate } from 'react-router-dom';
import { FolderPlus, Upload, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Landing page ("/") — offers the two entry points into the app: organise
 * documents inside a saved Project, or run a one-off upload/validation pass
 * without creating one. Guests can use either card; RequireUser on /projects
 * bounces them to /login if they pick "Create a Project".
 */
export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full flex flex-col items-center gap-2 mb-10 text-center">
        <h1 className="text-3xl font-bold">Welcome to Arkhive</h1>
        <p className="text-base-content/60">
          Organise documents in a project, or jump straight into a one-off upload.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 max-w-2xl w-full">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="group flex flex-col items-start gap-3 rounded-lg border border-base-300 bg-base-200/40 p-6 text-left transition-colors hover:bg-base-200"
        >
          <span className="rounded-lg bg-primary/10 p-3 text-primary">
            <FolderPlus className="w-6 h-6" />
          </span>
          <span className="text-lg font-semibold">Create a Project</span>
          <span className="text-sm text-base-content/60">
            {user
              ? 'Group documents together and pick up validation where you left off.'
              : 'Sign in to save documents and organise them into projects.'}
          </span>
          <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
            Go to Projects
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/upload')}
          className="group flex flex-col items-start gap-3 rounded-lg border border-base-300 bg-base-200/40 p-6 text-left transition-colors hover:bg-base-200"
        >
          <span className="rounded-lg bg-primary/10 p-3 text-primary">
            <Upload className="w-6 h-6" />
          </span>
          <span className="text-lg font-semibold">Upload Without a Project</span>
          <span className="text-sm text-base-content/60">
            Quickly extract data from a document without saving it anywhere.
          </span>
          <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
            Start Upload
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </div>
  );
}
