import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { AuthContext } from './AuthContext';

const GUEST_STORAGE_KEY = 'arkhive_guest_mode';

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider component manages global authentication state,
 * handles Supabase login, registration (with password hashing), Google OAuth,
 * and isolated guest session state.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(GUEST_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    // Fetch existing active session from Supabase
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (!isMounted) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession) {
          setIsGuest(false);
          try {
            sessionStorage.removeItem(GUEST_STORAGE_KEY);
          } catch {
            // Ignore storage access errors
          }
        }
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('[AuthContext] Failed to get session:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession) {
        setIsGuest(false);
        try {
          sessionStorage.removeItem(GUEST_STORAGE_KEY);
        } catch {
          // Ignore storage access errors
        }
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Signs in an existing user with email and password.
   * Returns human-readable error messages for UI display.
   */
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Invalid email or password. Please try again.' };
        }
        if (error.message.includes('Email not confirmed')) {
          return { error: 'Please check your inbox to verify your email before logging in.' };
        }
        return { error: error.message };
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'An unexpected error occurred during login.' };
    }
  }, []);

  /**
   * Registers a new user with email and password.
   * Password hashing (bcrypt) is handled automatically on Supabase's secure Auth server.
   */
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes('User already registered')) {
          return { error: 'An account with this email already exists.' };
        }
        if (error.message.includes('Password should be at least')) {
          return { error: 'Password must be at least 6 characters long.' };
        }
        return { error: error.message };
      }

      // If Supabase has email confirmations enabled, data.session will be null until verified
      const needsEmailConfirmation = !data.session && Boolean(data.user);

      return { error: null, needsEmailConfirmation };
    } catch (err: any) {
      return { error: err?.message || 'An unexpected error occurred during registration.' };
    }
  }, []);

  /**
   * Initiates Google OAuth with PKCE flow.
   */
  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      return { error: error?.message ?? null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to initiate Google sign-in.' };
    }
  }, []);

  /**
   * Activates guest mode for ephemeral, unsaved sessions.
   */
  const continueAsGuest = useCallback(() => {
    try {
      sessionStorage.setItem(GUEST_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage access errors
    }
    setIsGuest(true);
  }, []);

  /**
   * Signs out of Supabase and clears any guest flag.
   */
  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
    setIsGuest(false);
    setUser(null);
    setSession(null);

    try {
      const { error } = await supabase.auth.signOut();
      return { error: error?.message ?? null };
    } catch (err: any) {
      return { error: err?.message || 'An unexpected error occurred during sign out.' };
    }
  }, []);

  /**
   * Helper to retrieve the current JWT access token for backend requests.
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      isGuest,
      isLoading,
      signInWithGoogle,
      signInWithPassword,
      signUp,
      continueAsGuest,
      signOut,
      getAccessToken,
    }),
    [
      user,
      session,
      isGuest,
      isLoading,
      signInWithGoogle,
      signInWithPassword,
      signUp,
      continueAsGuest,
      signOut,
      getAccessToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
