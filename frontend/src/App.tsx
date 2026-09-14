import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { AuthGuard } from './components/auth/AuthGuard';
import { RequireUser } from './components/auth/RequireUser';
import LoginPage from './pages/login/LoginPage';
import Navbar from './pages/validation/components/navbar/Navbar';
import UploadPage from './pages/upload/UploadPage';
import ValidationPage from './pages/validation/ValidationPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import ProjectWorkspacePage from './pages/projects/ProjectWorkspacePage';

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
      </Router>
    </AuthProvider>
  );
}

export default App;
