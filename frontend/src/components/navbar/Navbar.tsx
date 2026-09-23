import {
  Sun,
  Moon,
  ScanLine,
  LayoutGrid,
  Columns2,
  ChevronLeft,
  LogOut,
  User as UserIcon,
  LogIn,
  FolderKanban,
  Home as HomeIcon,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getMaxStep } from '../../services/stepGuard';
import { useAuth } from '../../context/AuthContext';

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step = params.get('step');

  // Re-read maxStep on every render so it stays in sync with sessionStorage
  const maxStep = getMaxStep();

  function getCurrentStep(): number {
    if (location.pathname === '/validation') return 2;
    if (location.pathname === '/upload' && step === 'preview') return 1;
    return 0;
  }
  const currentStep = getCurrentStep();

  function handleStepClick(targetStep: number, path: string) {
    if (targetStep > maxStep) return; // locked - do nothing
    navigate(path);
  }

  const stepConfig = [
    {
      step: 0,
      label: 'Quick Scan',
      path: '/upload',
      icon: <ScanLine className="w-4 h-4" />,
    },
    {
      step: 1,
      label: 'Document Preview',
      path: '/upload?step=preview',
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      step: 2,
      label: 'Validation',
      path: '/validation',
      icon: <Columns2 className="w-4 h-4" />,
    },
  ];

  const isOnValidation = location.pathname === '/validation';

  // Check if current route is the login page
  const isOnLogin = location.pathname === '/login';

  // Check if current route is the landing page — the Quick Scan/Preview/
  // Validation step progress bar doesn't apply there either.
  const isOnHome = location.pathname === '/';

  // Check if current route is the Quick Scan (standalone upload) page itself
  // (the nav tab stays active there regardless of the ?step= query the
  // step-progress bar uses).
  const isOnUpload = location.pathname === '/upload';

  // Check if current route is anywhere under /projects — the guest-only
  // step progress bar (Quick Scan/Preview/Validation) doesn't apply there.
  const isOnProjects = location.pathname.startsWith('/projects');

  // Global auth state: access user identity, guest status, and sign-out action
  const { user, isGuest, signOut } = useAuth();

  function handleBack() {
    navigate('/upload?step=preview');
  }

  // Signs out of Supabase, cleans up local session/guest data, and routes to login
  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  // Allows guests to navigate to login/register if they choose to save their work
  function handleLoginClick() {
    navigate('/login', {
      state: {
        from: {
          pathname: location.pathname + location.search,
        },
      },
    });
  }

  function handleProjectsClick() {
    navigate('/projects');
  }

  function handleHomeClick() {
    navigate('/');
  }

  function handleUploadClick() {
    navigate('/upload');
  }

  return (
    <div>
      <div className="navbar bg-base-200 text-base-content px-17 py-2 border-b border-base-300">
        <div className="ml-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xl font-bold text-primary cursor-pointer bg-transparent border-0 p-0"
          >
            Arkhive
          </button>

          {/* Home + Quick Scan + Projects tabs — only shown once someone's
              past the login gate (real user or guest). Projects itself still
              requires a real user; guests see Home/Quick Scan only and get
              bounced to /login if they pick "Create a Project" there
              (handled by RequireUser). */}
          {(user || isGuest) && !isOnLogin && (
            <div className="ml-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleHomeClick}
                className={`btn btn-ghost btn-sm gap-1.5 border-b-2 ${
                  isOnHome
                    ? 'border-primary text-primary'
                    : 'border-transparent text-base-content/70'
                }`}
              >
                <HomeIcon className="w-4 h-4" />
                Home
              </button>
              <button
                type="button"
                onClick={handleUploadClick}
                className={`btn btn-ghost btn-sm gap-1.5 border-b-2 ${
                  isOnUpload
                    ? 'border-primary text-primary'
                    : 'border-transparent text-base-content/70'
                }`}
              >
                <ScanLine className="w-4 h-4" />
                Quick Scan
              </button>
              {user && (
                <button
                  type="button"
                  onClick={handleProjectsClick}
                  className={`btn btn-ghost btn-sm gap-1.5 border-b-2 ${
                    isOnProjects
                      ? 'border-primary text-primary'
                      : 'border-transparent text-base-content/70'
                  }`}
                >
                  <FolderKanban className="w-4 h-4" />
                  Projects
                </button>
              )}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-6">
          {/* Hide the 3-step workflow progress bar when on the login page,
              the Home landing page, or anywhere in the Projects section —
              that flow doesn't apply there. */}
          {!isOnLogin && !isOnHome && !isOnProjects && (
            <ul className="steps">
              {stepConfig.map(({ step: s, label, path, icon }) => {
                const isUnlocked = s <= maxStep;
                const isActive = currentStep >= s;

                return (
                  <li
                    key={s}
                    className={`step ${isActive ? 'step-primary' : isUnlocked ? '' : 'animate-pulse'}`}
                    onClick={() => handleStepClick(s, path)}
                    title={
                      !isUnlocked ? `Complete the previous step to unlock ${label}` : undefined
                    }
                    style={{
                      cursor: isUnlocked ? 'pointer' : 'not-allowed',
                      zIndex: 50 - s,
                    }}
                  >
                    <span
                      className={`step-icon transition ${isUnlocked ? 'hover:scale-130' : 'opacity-40'}`}
                    >
                      {icon}
                    </span>
                    <span className={!isUnlocked ? 'opacity-40' : undefined}>{label}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {isOnValidation && (
            <button type="button" onClick={handleBack} className="btn btn-outline btn-sm gap-1.5">
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {/* Authenticated State: profile menu — click the user icon to reveal
              the account name (display-only) and sign out. */}
          {user && (
            <div className="dropdown dropdown-end">
              <button
                tabIndex={0}
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                title={
                  user.user_metadata?.display_name || user.user_metadata?.full_name || user.email
                }
              >
                <UserIcon className="w-5 h-5 text-primary" />
              </button>
              <ul
                tabIndex={0}
                className="dropdown-content menu z-50 mt-2 w-56 rounded-box bg-base-100 p-2 shadow-md"
              >
                <li className="disabled">
                  <span className="truncate text-sm font-medium text-base-content/80">
                    {user.user_metadata?.display_name || user.user_metadata?.full_name || user.email}
                  </span>
                </li>
                <li>
                  <button type="button" onClick={handleSignOut} className="text-error">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </li>
              </ul>
            </div>
          )}

          {/* Guest State: Display warning badge that data is session based + link to log in */}
          {isGuest && !isOnLogin && (
            <div className="flex items-center gap-3 text-sm">
              <span className="badge badge-warning badge-md">Guest Mode</span>
              <button
                type="button"
                onClick={handleLoginClick}
                className="btn btn-outline btn-sm gap-1.5"
                title="Sign in to save documents"
              >
                <LogIn className="w-4 h-4" />
                Log In
              </button>
            </div>
          )}

          {/* Dark/Light theme toggle */}
          <label className="swap swap-rotate cursor-pointer mx-2">
            <input
              type="checkbox"
              value="night"
              className="theme-controller hover:scale-110 transition"
            />
            <Sun className="swap-off w-5 h-5 hover:scale-110 transition" />
            <Moon className="swap-on w-5 h-5 hover:scale-110 transition" />
            <span className="sr-only">Toggle Theme</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
