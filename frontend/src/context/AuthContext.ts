import { createContext, useContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Developed with the assistance of Google Gemini.
 */
export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isGuest: boolean;
  isLoading: boolean;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  continueAsGuest: () => void;
  signOut: () => Promise<{ error: Error | null }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
