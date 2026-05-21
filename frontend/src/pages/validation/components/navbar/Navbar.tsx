import { Sun, Moon, Upload, LayoutGrid, Columns2 } from 'lucide-react';

export const Navbar = () => {
  return (
    <div>
      <div className="navbar bg-primary text-primary-content">
        <div className="flex-1">
          <a className="text-xl font-bold">Arkhive</a>
        </div>
        <div className="flex-1">
          <ul className="menu menu-horizontal px-1 items-center">
            <li>
              <a className="flex items-center gap-2">Upload <Upload className="w-5 h-5" /></a>
            </li>
            <li>
              <a className="flex items-center gap-2">Preview <LayoutGrid className="w-5 h-5" /></a>
            </li>
            <li>
              <a className="flex items-center gap-2">Validation <Columns2 className="w-5 h-5" /></a>
            </li>
            <li>
              <label className="swap swap-rotate cursor-pointer mx-2">
                {/* hidden checkbox that toggles night/day theme */}
                <input type="checkbox" value="night" className="theme-controller" />
                <Sun className="swap-off w-5 h-5" />
                <Moon className="swap-on w-5 h-5" />
              </label>
            </li>
          </ul>
        </div>
      </div>
    </div >
  );
};

export default Navbar;
