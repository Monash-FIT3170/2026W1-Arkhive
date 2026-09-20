import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import * as AuthContextModule from '../../context/AuthContext';

// Mock useAuth
vi.mock('../../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('AuthGuard', () => {
  const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner while session is loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      isGuest: false,
      isLoading: true,
      signInWithGoogle: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      continueAsGuest: vi.fn(),
      signOut: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<AuthGuard />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/checking authentication session/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when user is neither logged in nor a guest', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      isGuest: false,
      isLoading: false,
      signInWithGoogle: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      continueAsGuest: vi.fn(),
      signOut: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<AuthGuard />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders protected content when user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' } as any,
      session: { access_token: 'fake-jwt' } as any,
      isGuest: false,
      isLoading: false,
      signInWithGoogle: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      continueAsGuest: vi.fn(),
      signOut: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<AuthGuard />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('renders protected content when visitor is in guest mode', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      isGuest: true,
      isLoading: false,
      signInWithGoogle: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      continueAsGuest: vi.fn(),
      signOut: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<AuthGuard />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
