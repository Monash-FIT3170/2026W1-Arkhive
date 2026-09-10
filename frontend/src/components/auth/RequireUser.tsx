import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Allows only a real, signed-in user.
 */
export const RequireUser = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <span className="loading loading-spinner loading-lg text-primary mb-4" />
        <p className="text-base text-base-content/70">Checking authentication session...</p>
      </div>
    );
  }

  // Guests are explicitly excluded here, unlike AuthGuard.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default RequireUser;
