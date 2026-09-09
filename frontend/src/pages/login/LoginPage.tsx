import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';

/**
 * Login & Registration Page Placeholder.
 * UI implementation (email/password fields, guest flow, form validation, and styling)
 */

type Mode = 'login' | 'register';

export const LoginPage = () => {
  const {
    user,
    isGuest,
    isLoading,
    signInWithPassword,
    signUp,
    signInWithGoogle,
    continueAsGuest,
  } = useAuth();
  const location = useLocation();
  const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuestWarning, setShowGuestWarning] = useState(false);

  // Redirect if already authenticated or guest
  if (!isLoading && (user || isGuest)) {
    return <Navigate to={destination} replace />;
  }

  // Form validation
  const validate = (): string | null => {
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    if (!password) return 'Password is required.';
    if (mode === 'register') {
      if (password.length < 6) return 'Password must be at least 6 characters.';
      if (password !== confirmPassword) return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccessMessage(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    if (mode === 'login') {
      const { error } = await signInWithPassword(email, password);
      if (error) {
        setError(error);
      }
    } else {
      const { error, needsEmailConfirmation } = await signUp(email, password);
      if (error) {
        setError(error);
      } else if (needsEmailConfirmation) {
        setSuccessMessage(
          'Account created! Please check your email to confirm your account before logging in.'
        );
      }
    }

    setIsSubmitting(false);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="min-h-screen bg-base-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-base-200 rounded-2xl shadow-lg p-8 flex flex-col gap-6">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">Arkhive</h1>
          <p className="text-sm text-base-content/60 mt-1">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* toggle mode */}
        <div className="flex rounded-xl overflow-hidden border border-base-300">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content/60 hover:text-base-content'}`}
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMessage(null);
            }}
          >
            Login
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'register' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content/60 hover:text-base-content'}`}
            onClick={() => {
              setMode('register');
              setError(null);
              setSuccessMessage(null);
            }}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            className="input input-bordered w-full bg-base-100"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
          <input
            type="password"
            placeholder="Password"
            className="input input-bordered w-full bg-base-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
          {mode === 'register' && (
            <input
              type="password"
              placeholder="Confirm Password"
              className="input input-bordered w-full bg-base-100"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
            />
          )}
        </div>

        {/* Error/Success */}
        {error && <div className="alert alert-error text-sm py-2 px-4 rounded-xl">{error}</div>}
        {successMessage && (
          <div className="alert alert-success text-sm py-2 px-4 rounded-xl">{successMessage}</div>
        )}

        <button className="btn btn-primary w-full" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="loading loading-spinner loading-sm" />
          ) : mode === 'login' ? (
            'Sign In'
          ) : (
            'Create Account'
          )}
        </button>

        <div className="divider text-xs text-base-content/40">OR</div>

        {/* Google Sign In */}
        <button
          className="btn btn-outline w-full gap-2"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Guest */}
        <button
          className="btn btn-ghost w-full text-base-content/60 hover:text-base-content"
          onClick={() => setShowGuestWarning(true)}
          disabled={isSubmitting}
        >
          Continue as Guest
        </button>
      </div>

      {/* Guest warning modal */}
      {showGuestWarning && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-200">
            <h3 className="font-bold text-lg">Guest Mode</h3>
            <p className="py-4 text-sm text-base-content/70">
              You are continuing as a guest. Your data will{' '}
              <span className="font-semibold text-warning">not be saved</span> after your session
              ends. To keep your work, create a free account.
            </p>
            <div className="modal-action gap-2">
              <button className="btn btn-ghost" onClick={() => setShowGuestWarning(false)}>
                Go Back
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowGuestWarning(false);
                  continueAsGuest();
                }}
              >
                Continue as Guest
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowGuestWarning(false)} />
        </div>
      )}
    </div>
  );
};

export default LoginPage;
