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

/**
 * Developed with the assistance of Google Gemini.
 */
const GUEST_STORAGE_KEY = 'arkhive_guest_mode';

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider component handles authentication state for the application.
 * It provides user authentication state, guest mode functionality, and authentication actions.
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

  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      return { error };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  const continueAsGuest = useCallback(() => {
    try {
      sessionStorage.setItem(GUEST_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage access errors
    }
    setIsGuest(true);
  }, []);

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
      return { error };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      isGuest,
      isLoading,
      signInWithGoogle,
      continueAsGuest,
      signOut,
    }),
    [user, session, isGuest, isLoading, signInWithGoogle, continueAsGuest, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
