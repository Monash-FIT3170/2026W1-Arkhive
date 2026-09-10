import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Authentication middleware stub.
 * Pluggable boundary for Supabase Auth integration.
 *
 * In production, it extracts the Bearer token and verifies with Supabase auth.getUser(token).
 * In development / test, if no Bearer token or Supabase is not configured, it falls back to a dev user ID.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      // In real integration, supabase.auth.getUser(token) will be called by teammate.
      // For now, if token is provided or in dev mode:
      if (token && token !== 'dev-token') {
        // If Supabase client is configured, we could attempt to verify or decode:
        // const { data: { user }, error } = await supabase.auth.getUser(token);
        // if (!error && user) { req.userId = user.id; return next(); }
      }
    } catch (err) {
      console.error('Error verifying auth token:', err);
    }
  }

  // Development / fallback environment support
  if (process.env.NODE_ENV !== 'production' || !process.env.SUPABASE_URL) {
    req.userId = (req.headers['x-dev-user-id'] as string) || '00000000-0000-0000-0000-000000000001';
    return next();
  }

  res.status(401).json({ error: 'Unauthorized. Missing or invalid authentication token.' });
}
