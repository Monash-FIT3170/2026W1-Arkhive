import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import * as AuthContextModule from '../../../../context/AuthContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContextModule>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Navbar', () => {
  const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Guest Mode badge and Log In button when user is a guest', () => {
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
      <MemoryRouter initialEntries={['/validation']}>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.getByText('Guest Mode')).toBeInTheDocument();
    const loginBtn = screen.getByRole('button', { name: /log in/i });
    expect(loginBtn).toBeInTheDocument();

    fireEvent.click(loginBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      state: {
        from: {
          pathname: '/validation',
        },
      },
    });
  });

  it('hides Guest Mode badge and Log In button on /login', () => {
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
      <MemoryRouter initialEntries={['/login']}>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.queryByText('Guest Mode')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
  });

  it('displays user display name when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'u1',
        email: 'user@example.com',
        user_metadata: { display_name: 'Alex' },
      } as any,
      session: { access_token: 'tok' } as any,
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
      <MemoryRouter initialEntries={['/']}>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
