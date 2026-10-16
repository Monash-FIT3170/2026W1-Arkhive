import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { requireAuth, type AuthenticatedRequest } from './auth';
// This test file was generated with the assistance of Google Gemini.
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
  isSupabaseConfigured: true,
}));

import { supabase } from '../services/supabaseClient';

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers,
  } as AuthenticatedRequest;

  let statusCode = 200;
  let jsonResponse: any = null;

  const res = {
    status: vi.fn().mockImplementation((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: any) => {
      jsonResponse = data;
      return res;
    }),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
  };
}

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({});

    await requireAuth(req, res, next);

    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse()).toEqual({ error: 'Unauthorized. Missing Bearer token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
      authorization: 'Basic dXNlcjpwYXNz',
    });

    await requireAuth(req, res, next);

    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse()).toEqual({ error: 'Unauthorized. Missing Bearer token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase returns an authentication error', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'jwt expired', name: 'AuthApiError', status: 401 },
    } as any);

    const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
      authorization: 'Bearer expired-or-invalid-jwt',
    });

    await requireAuth(req, res, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('expired-or-invalid-jwt');
    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse()).toEqual({ error: 'Unauthorized. Invalid or expired token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase returns no error but user is null', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: null,
    } as any);

    const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
      authorization: 'Bearer ghost-user-token',
    });

    await requireAuth(req, res, next);

    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse()).toEqual({ error: 'Unauthorized. Invalid or expired token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with server error message when Supabase throws an unexpected error', async () => {
    vi.mocked(supabase.auth.getUser).mockRejectedValueOnce(new Error('Network connection timeout'));

    const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
      authorization: 'Bearer error-token',
    });

    await requireAuth(req, res, next);

    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse()).toEqual({ error: 'Unauthorized. Failed to verify token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.userId and calls next when token is valid', async () => {
    const mockUser = { id: 'usr-987-abc', email: 'test@example.com' };
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    } as any);

    const { req, res, next, getStatusCode } = createMockReqRes({
      authorization: 'Bearer valid-jwt-token-xyz',
    });

    await requireAuth(req, res, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-jwt-token-xyz');
    expect(req.userId).toBe('usr-987-abc');
    expect(next).toHaveBeenCalledTimes(1);
    expect(getStatusCode()).toBe(200);
  });
});
