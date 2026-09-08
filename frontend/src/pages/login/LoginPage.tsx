import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Login & Registration Page Placeholder.
 * UI implementation (email/password fields, guest flow, form validation, and styling)
 */
export const LoginPage = () => {
  const { user, isGuest, isLoading } = useAuth();
  const location = useLocation();

  const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  // Redirect if already authenticated or operating as a guest
  if (!isLoading && (user || isGuest)) {
    return <Navigate to={destination} replace />;
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Login / Registration</h1>
      <p className="text-sm text-base-content/70">
        Placeholder view. UI components (email/password fields, login/register buttons, guest flow, and validation) will be implemented by Aryan.
      </p>
    </div>
  );
};

export default LoginPage;
