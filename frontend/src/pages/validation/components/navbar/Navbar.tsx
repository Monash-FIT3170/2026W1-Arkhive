import { Sun, Moon, Upload, LayoutGrid, Columns2, Share2Icon } from 'lucide-react';
import { useNavigate } from "react-router-dom";

export const Navbar = () => {
  const navigate = useNavigate();

  const handleStepClick = (route: string) => {
    navigate(route);
  };


  return (
    <div>
      <div className="navbar bg-base-200 text-base-content px-17 border-b border-base-300">
        <div className="margin-left-2 flex items-center gap-2">
          <a className="text-xl font-bold text-primary">Arkhive</a>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <ul className="steps">
            <li className="step step-primary cursor-pointer " onClick={() => handleStepClick("/")}>
              <span className="step-icon"><Upload className="w-4 h-4 hover:scale-130 transition" /></span>
              Upload
            </li>
            <li className="step step-primary cursor-pointer" onClick={() => handleStepClick("/preview")}>
              <span className="step-icon"><LayoutGrid className="w-4 h-4 hover:scale-130 transition" /></span>
              Document Preview
            </li>
            <li className="step step-primary cursor-pointer" onClick={() => handleStepClick("/validation")}>
              <span className="step-icon"><Columns2 className="w-4 h-4 hover:scale-130 transition" /></span>
              Validation
            </li>
            <li className="step animate-pulse cursor-pointer" onClick={() => handleStepClick("/export")}>
              <span className="step-icon"><Share2Icon className="w-4 h-4 hover:scale-130 transition" /></span>
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
