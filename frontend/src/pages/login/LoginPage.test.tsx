import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContextModule>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('LoginPage', () => {
  const mockUseAuth = vi.mocked(AuthContextModule.useAuth);
  const mockSignUp = vi.fn();
  const mockSignInWithPassword = vi.fn();
  const mockSignInWithGoogle = vi.fn();
  const mockContinueAsGuest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      isGuest: false,
      isLoading: false,
      signInWithGoogle: mockSignInWithGoogle,
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      continueAsGuest: mockContinueAsGuest,
      signOut: vi.fn(),
      getAccessToken: vi.fn(),
    });
  });

  it('renders login mode by default without display name and last name fields', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Display Name (first name or nickname)')
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Last Name (optional)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('switches to register mode and displays the display name and last name fields', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const registerTab = screen.getByRole('button', { name: 'Register' });
    fireEvent.click(registerTab);

    expect(
      screen.getByPlaceholderText('Display Name (first name or nickname)')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Last Name (optional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('shows validation error if display name is empty when registering', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByText('Display name is required.')).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('calls signUp with display name and optional last name on registration', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null, needsEmailConfirmation: false });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    fireEvent.change(
      screen.getByPlaceholderText('Display Name (first name or nickname)'),
      { target: { value: 'Alex' } }
    );
    fireEvent.change(screen.getByPlaceholderText('Last Name (optional)'), {
      target: { value: 'Smith' },
    });
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'alex.smith@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'secret123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('alex.smith@example.com', 'secret123', {
        displayName: 'Alex',
        firstName: 'Alex',
        lastName: 'Smith',
      });
    });
  });

  it('allows registering without last name', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null, needsEmailConfirmation: false });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    fireEvent.change(
      screen.getByPlaceholderText('Display Name (first name or nickname)'),
      { target: { value: 'Sammy' } }
    );
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'sammy@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'secret123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('sammy@example.com', 'secret123', {
        displayName: 'Sammy',
        firstName: 'Sammy',
        lastName: '',
      });
    });
  });

  it('shows success message when email confirmation is needed', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null, needsEmailConfirmation: true });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    fireEvent.change(
      screen.getByPlaceholderText('Display Name (first name or nickname)'),
      { target: { value: 'Alex' } }
    );
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'secret123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(
        screen.getByText(/account created! please check your email/i)
      ).toBeInTheDocument();
    });
  });
});
