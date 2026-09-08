import { Sun, Moon, Upload, LayoutGrid, Columns2, ChevronLeft, LogOut, User as UserIcon, LogIn } from 'lucide-react';
import { useNavigate, useLocation } from "react-router-dom";
import { getMaxStep } from "../../../../services/stepGuard";
import { useAuth } from "../../../../context/AuthContext";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step = params.get('step');

  // Re-read maxStep on every render so it stays in sync with sessionStorage
  const maxStep = getMaxStep();

  function getCurrentStep(): number {
    if (location.pathname === '/validation') return 2;
    if (location.pathname === '/' && step === 'preview') return 1;
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
      label: "Upload",
      path: "/",
      icon: <Upload className="w-4 h-4" />,
    },
    {
      step: 1,
      label: "Document Preview",
      path: "/?step=preview",
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      step: 2,
      label: "Validation",
      path: "/validation",
      icon: <Columns2 className="w-4 h-4" />,
    },
  ];

  const isOnValidation = location.pathname === '/validation';

  // Check if current route is the login page
  const isOnLogin = location.pathname === '/login';

  // Global auth state: access user identity, guest status, and sign-out action
  const { user, isGuest, signOut } = useAuth();

  function handleBack() {
    navigate("/?step=preview");
  }

  // Signs out of Supabase, cleans up local session/guest data, and routes to login
  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  // Allows guests to navigate to login/register if they choose to save their work
  function handleLoginClick() {
    navigate('/login');
  }
  return (
    <div>
      <div className="navbar bg-base-200 text-base-content px-17 border-b border-base-300">
        <div className="margin-left-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xl font-bold text-primary cursor-pointer bg-transparent border-0 p-0"
          >
            Arkhive
          </button>
        </div>
        <div className="ml-auto flex items-center gap-6">
          {/* Hide the 3-step workflow progress bar when the user is on the login page */}
          {!isOnLogin && (
            <ul className="steps">
              {stepConfig.map(({ step: s, label, path, icon }) => {
                const isUnlocked = s <= maxStep;
                const isActive = currentStep >= s;

                return (
                  <li
                    key={s}
                    className={`step ${isActive ? "step-primary" : isUnlocked ? "" : "animate-pulse"}`}
                    onClick={() => handleStepClick(s, path)}
                    title={!isUnlocked ? `Complete the previous step to unlock ${label}` : undefined}
                    style={{ 
                      cursor: isUnlocked ? "pointer" : "not-allowed",
                      zIndex: 50 - s
                    }}
                  >
                    <span
                      className={`step-icon transition ${isUnlocked ? "hover:scale-130" : "opacity-40"}`}
                    >
                      {icon}
                    </span>
                    <span className={!isUnlocked ? "opacity-40" : undefined}>
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {isOnValidation && (
            <button
              type="button"
              onClick={handleBack}
              className="btn btn-outline btn-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {/* Authenticated State: Display user name or email + sign out button */}
          {user && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className="flex items-center gap-1 font-medium text-base-content/80 max-w-[160px] truncate"
                title={user.email}
              >
                <UserIcon className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span className="truncate">{user.user_metadata?.full_name || user.email}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="btn btn-ghost btn-xs text-error gap-1"
                title="Sign out of your account"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}

          {/* Guest State: Display warning badge that data is session based + link to log in */}
          {isGuest && (
            <div className="flex items-center gap-2 text-xs">
              <span className="badge badge-warning badge-sm">Guest Mode</span>
              <button
                type="button"
                onClick={handleLoginClick}
                className="btn btn-outline btn-xs gap-1"
                title="Sign in to save documents"
              >
                <LogIn className="w-3.5 h-3.5" />
                Log In
              </button>
            </div>
          )}

          {/* Dark/Light theme toggle */}
          <label className="swap swap-rotate cursor-pointer mx-2">
            <input type="checkbox" value="night" className="theme-controller hover:scale-110 transition" />
            <Sun className="swap-off w-8 h-8 hover:scale-110 transition" />
            <Moon className="swap-on w-8 h-8 hover:scale-110 transition" />
            <span className="sr-only">Toggle Theme</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default Navbar;