import { Sun, Moon, Upload, LayoutGrid, Columns2, Share2Icon } from 'lucide-react';
import { useNavigate, useLocation } from "react-router-dom";

export const Navbar = () => {
  const navigate = useNavigate();  // ← was missing
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step = params.get('step');

  function getCurrentStep(): number {
    if (location.pathname === '/validation') return 2;
    if (location.pathname === '/export') return 3;
    if (location.pathname === '/' && step === 'preview') return 1;
    return 0;
  }
  const currentStep = getCurrentStep();






  return (
    <div>
      <div className="navbar bg-base-200 text-base-content px-17 border-b border-base-300">
        <div className="margin-left-2 flex items-center gap-2">
          <a className="text-xl font-bold text-primary">Arkhive</a>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <ul className="steps">
            <li className="step step-primary z-50" onClick={() => navigate("/")}>
              <span className="step-icon"><Upload className="w-4 h-4 hover:scale-130 transitio cursor-pointer" /></span>
              Upload
            </li>
            <li className={`step ${currentStep >= 1 ? "step-primary" : "animate-pulse"} z-40`} onClick={() => navigate("/?step=preview")}>
              <span className="step-icon"><LayoutGrid className="w-4 h-4 hover:scale-130 transition  cursor-pointer" /></span>
              Document Preview
            </li>
            <li className={`step ${currentStep >= 2 ? "step-primary" : "animate-pulse"} z-30`} onClick={() => navigate("/validation")}>
              <span className="step-icon"><Columns2 className="w-4 h-4 hover:scale-130 transition  cursor-pointer" /></span>
              Validation
            </li>
            <li className={`step ${currentStep >= 3 ? "step-primary" : "animate-pulse"} z-10`} onClick={() => navigate("/export")}>
              <span className="step-icon"><Share2Icon className="w-4 h-4 hover:scale-130 transition  cursor-pointer" /></span>
              Export
            </li>
            <label className="swap swap-rotate cursor-pointer mx-2">
              {/* hidden checkbox that toggles night/day theme */}
              <input type="checkbox" value="night" className="theme-controller hover:scale-110 transition" />
              <Sun className="swap-off w-8 h-8 hover:scale-110 transition" />
              <Moon className="swap-on w-8 h-8 hover:scale-110 transition" />
              <span className="sr-only">Toggle Theme</span>
            </label>
          </ul>
        </div>
      </div>
    </div >
  );
};

export default Navbar;
