import { Sun, Moon, Upload, LayoutGrid, Columns2, Share2Icon } from 'lucide-react';
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { getMaxStep } from "../../../../services/stepGuard";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step = params.get('step');

  // Re-read maxStep on every render so it stays in sync with sessionStorage
  const [maxStep, setMaxStep] = useState(getMaxStep);

  // Sync maxStep whenever the route changes (user navigated successfully)
  useEffect(() => {
    setMaxStep(getMaxStep());
  }, [location]);

  function getCurrentStep(): number {
    if (location.pathname === '/validation') return 2;
    if (location.pathname === '/' && step === 'preview') return 1;
    return 0;
  }
  const currentStep = getCurrentStep();

  function handleStepClick(targetStep: number, path: string) {
    if (targetStep > maxStep) return; // locked — do nothing
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






  return (
    <div>
      <div className="navbar bg-base-200 text-base-content px-17 border-b border-base-300">
        <div className="margin-left-2 flex items-center gap-2">
          <a className="text-xl font-bold text-primary">Arkhive</a>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <ul className="steps">
            {stepConfig.map(({ step: s, label, path, icon }) => {
              const isUnlocked = s <= maxStep;
              const isActive = currentStep >= s;

              return (
                <li
                  key={s}
                  className={`step ${isActive ? "step-primary" : isUnlocked ? "" : "animate-pulse"} z-${50 - s * 10}`}
                  onClick={() => handleStepClick(s, path)}
                  title={!isUnlocked ? `Complete the previous step to unlock ${label}` : undefined}
                  style={{ cursor: isUnlocked ? "pointer" : "not-allowed" }}
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

            <label className="swap swap-rotate cursor-pointer mx-2">
              <input type="checkbox" value="night" className="theme-controller hover:scale-110 transition" />
              <Sun className="swap-off w-8 h-8 hover:scale-110 transition" />
              <Moon className="swap-on w-8 h-8 hover:scale-110 transition" />
              <span className="sr-only">Toggle Theme</span>
            </label>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
