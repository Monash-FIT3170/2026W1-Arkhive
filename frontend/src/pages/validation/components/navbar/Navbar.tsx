import { Sun, Moon, Upload, LayoutGrid, Columns2 } from 'lucide-react';

export const Navbar = () => {
  return (
    <div>
      <div className="navbar bg-base-200 text-base-content px-17 border-b border-base-300">
        <div className="margin-left-2 flex items-center gap-2">
          <a className="text-xl font-bold text-primary">Arkhive</a>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <ul className="steps">
            <li className="step step-primary"><span className="step-icon"><Upload className="w-4 h-4" /></span>Upload</li>
            <li className="step step-primary"><span className="step-icon"><LayoutGrid className="w-4 h-4" /></span>Document Preview</li>
            <li className="step step-primary"><span className="step-icon"><Columns2 className="w-4 h-4" /></span>Validation</li>
            <li className="step"><span className="step-icon"></span>Export</li>
            <li>
              <label className="swap swap-rotate cursor-pointer mx-2 top-1.5">
                {/* hidden checkbox that toggles night/day theme */}
                <input type="checkbox" value="night" className="theme-controller" />
                <Sun className="swap-off w-8 h-8" />
                <Moon className="swap-on w-8 h-8" />
              </label>
            </li>
          </ul>
        </div>
      </div>
    </div >
  );
};

export default Navbar;
