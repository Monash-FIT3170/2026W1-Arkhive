import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Developed with the assistance of Google Gemini.
 */
export const AuthGuard = () => {
  const { user, isGuest, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <span className="loading loading-spinner loading-lg text-primary mb-4" />
        <p className="text-base text-base-content/70">Checking authentication session...</p>
      </div>
    );
  }

  // If user is neither logged in nor a guest, redirect to login
  if (!user && !isGuest) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated or operating in guest mode
  return <Outlet />;
};

export default AuthGuard;
