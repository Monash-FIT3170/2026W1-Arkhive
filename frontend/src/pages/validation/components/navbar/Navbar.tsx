import { Sun, Upload, LayoutGrid, Columns2 } from 'lucide-react';


export const Navbar = () => {
  return (
    <div>
      <div className="navbar bg-primary text-primary-content">
        <div className="flex-1">
          <a className="text-xl font-bold">Arkhive</a>
        </div>
        <div className="flex-1">
          <ul className="menu menu-horizontal px-1">
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
              <a><Sun className="w-5 h-5" /></a>
            </li>
          </ul>
        </div>
      </div>
    </div >
  );
};

export default Navbar;
