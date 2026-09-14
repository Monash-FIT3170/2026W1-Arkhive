import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabaseClient';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Authentication middleware. Reads the Authorization: Bearer <token> header,
 * verifies it against Supabase Auth, and attaches the resulting user id to
 * req.userId. Rejects any request without a valid token
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized. Missing Bearer token.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
      return;
    }

    req.userId = data.user.id;
    next();
  } catch (err) {
    console.error('Error verifying auth token:', err);
    res.status(401).json({ error: 'Unauthorized. Failed to verify token.' });
  }
}
