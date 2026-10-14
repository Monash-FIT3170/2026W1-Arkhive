import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './AuthContext';
// This test file was generated with the assistance of Google Gemini.
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  },
  isSupabaseConfigured: true,
}));

import { supabase } from '../services/supabaseClient';

const mockSubscription = {
  unsubscribe: vi.fn(),
};

function TestConsumer() {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="loading">{auth.isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="user">{auth.user ? auth.user.email : 'no-user'}</div>
      <div data-testid="is-guest">{auth.isGuest ? 'guest' : 'not-guest'}</div>
      <button onClick={() => auth.continueAsGuest()} data-testid="btn-guest">
        Guest
      </button>
      <button
        onClick={() => auth.signInWithPassword('test@example.com', 'password123')}
        data-testid="btn-login"
      >
        Login
      </button>
      <button
        onClick={() =>
          auth.signUp('new@example.com', 'pass123', { displayName: 'Alice', lastName: 'Smith' })
        }
        data-testid="btn-signup"
      >
        SignUp
      </button>
      <button onClick={() => auth.signInWithGoogle()} data-testid="btn-google">
        Google
      </button>
      <button onClick={() => auth.signOut()} data-testid="btn-signout">
        SignOut
      </button>
    </div>
  );
}

describe('AuthProvider & useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: mockSubscription },
    } as any);
  });

  it('throws error when useAuth is consumed outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });

  it('hydrates initial active session from Supabase on mount', async () => {
    const mockUser = { id: 'u1', email: 'alice@example.com' };
    const mockSession = { user: mockUser, access_token: 'token-123' };

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: mockSession as any },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      expect(screen.getByTestId('user')).toHaveTextContent('alice@example.com');
      expect(screen.getByTestId('is-guest')).toHaveTextContent('not-guest');
    });
  });

  it('restores guest mode from sessionStorage if present when no active session', async () => {
    sessionStorage.setItem('arkhive_guest_mode', 'true');

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      expect(screen.getByTestId('is-guest')).toHaveTextContent('guest');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });
  });

  it('handles getSession rejection gracefully on mount', async () => {
    vi.mocked(supabase.auth.getSession).mockRejectedValueOnce(new Error('Network error'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });

    consoleError.mockRestore();
  });

  it('unsubscribes auth listener on unmount', () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const { unmount } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    unmount();
    expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('activates guest mode via continueAsGuest()', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

    const guestBtn = screen.getByTestId('btn-guest');
    await userEvent.click(guestBtn);

    expect(screen.getByTestId('is-guest')).toHaveTextContent('guest');
    expect(sessionStorage.getItem('arkhive_guest_mode')).toBe('true');
  });

  it('translates invalid credentials error on signInWithPassword', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' } as any,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let loginResult: { error: string | null } | undefined;
    await act(async () => {
      loginResult = await result.current.signInWithPassword('wrong@test.com', 'badpass');
    });

    expect(loginResult?.error).toBe('Invalid email or password. Please try again.');
  });

  it('translates email not confirmed error on signInWithPassword', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Email not confirmed' } as any,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let loginResult: { error: string | null } | undefined;
    await act(async () => {
      loginResult = await result.current.signInWithPassword('unconfirmed@test.com', 'pass');
    });

    expect(loginResult?.error).toBe('Please check your inbox to verify your email before logging in.');
  });

  it('handles signUp with user profile metadata and confirmation flag', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: {
        user: { id: 'new-u1' } as any,
        session: null, // Needs email verification
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let signUpResult: { error: string | null; needsEmailConfirmation?: boolean } | undefined;
    await act(async () => {
      signUpResult = await result.current.signUp('test@test.com', 'secret123', {
        displayName: 'Sam',
        lastName: 'Taylor',
      });
    });

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@test.com',
      password: 'secret123',
      options: {
        data: {
          display_name: 'Sam',
          first_name: 'Sam',
          last_name: 'Taylor',
          full_name: 'Sam Taylor',
        },
      },
    });

    expect(signUpResult).toEqual({ error: null, needsEmailConfirmation: true });
  });

  it('initiates Google sign-in with signInWithGoogle()', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValueOnce({
      data: { provider: 'google', url: 'https://auth.google.com' },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
  });

  it('signs out and purges user, session, and guest mode flag', async () => {
    sessionStorage.setItem('arkhive_guest_mode', 'true');
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } as any },
      error: null,
    });
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

    const signoutBtn = screen.getByTestId('btn-signout');
    await userEvent.click(signoutBtn);

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('is-guest')).toHaveTextContent('not-guest');
    expect(sessionStorage.getItem('arkhive_guest_mode')).toBeNull();
  });

  it('getAccessToken returns JWT from session or null', async () => {
    vi.mocked(supabase.auth.getSession)
      .mockResolvedValueOnce({
        data: { session: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'jwt-access-token' } as any },
        error: null,
      });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const token = await result.current.getAccessToken();
    expect(token).toBe('jwt-access-token');
  });
});
