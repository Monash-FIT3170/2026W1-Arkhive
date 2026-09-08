import { createContext, useContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isGuest: boolean;
  isLoading: boolean;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  continueAsGuest: () => void;
  signOut: () => Promise<{ error: string | null }>;
  getAccessToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
