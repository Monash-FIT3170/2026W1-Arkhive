import './App.css';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'; // NEW: useLocation added
import { AuthProvider } from './context/AuthProvider';
import { AuthGuard } from './components/auth/AuthGuard';
import { RequireUser } from './components/auth/RequireUser';
import LoginPage from './pages/login/LoginPage';
import Navbar from './components/navbar/Navbar';
import HomePage from './pages/home/HomePage';
import UploadPage from './pages/upload/UploadPage';
import ValidationPage from './pages/validation/ValidationPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import ProjectWorkspacePage from './pages/projects/ProjectWorkspacePage';
import MobileCapture from './pages/upload/MobileCapture'; 


// Wraps the existing layout so it can hide the desktop Navbar on the
// phone-facing QR capture page, which has no login and no desktop chrome.
function AppContent() {
  const location = useLocation(); // NEW
  const isMobileCapture = location.pathname.startsWith('/upload/mobile/'); 

  return (
    <div className="min-h-screen bg-base-100 text-base-content flex flex-col">
      {!isMobileCapture && <Navbar />} {/* NEW: condition added around existing <Navbar /> */}
      <div className="flex-1 flex flex-col">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* NEW: no auth guard — the phone proves access via its QR token, not a login */}
          <Route path="/upload/mobile/:token" element={<MobileCapture />} />
          <Route element={<AuthGuard />}>
            <Route path="/" element={<UploadPage />} />
            <Route path="/validation" element={<ValidationPage />} />
          </Route>
          <Route element={<RequireUser />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectWorkspacePage />} />
          </Route>
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-base-100 text-base-content flex flex-col">
          <Navbar />
          <div className="flex-1 flex flex-col">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AuthGuard />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/validation" element={<ValidationPage />} />
              </Route>
              <Route element={<RequireUser />}>
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:id" element={<ProjectWorkspacePage />} />
              </Route>
            </Routes>
          </div>
        </div>
        <AppContent /> {/* NEW: body extracted into AppContent, unchanged otherwise */}
      </Router>
    </AuthProvider>
  );
}

export default App;