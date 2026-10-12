/** Used only when NODE_ENV is not production and SESSION_SECRET is unset. */
export const DEV_SESSION_SECRET = 'arkhive-dev-secret';

export const MISSING_SESSION_SECRET_ERROR =
  'SESSION_SECRET must be set when NODE_ENV is production.';

type SessionEnv = {
  SESSION_SECRET?: string;
  NODE_ENV?: string;
};

/**
 * Cookie-signing secret. Production must set SESSION_SECRET.
 * Local dev and tests may fall back to a known default.
 */
export function resolveSessionSecret(env: SessionEnv = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(MISSING_SESSION_SECRET_ERROR);
  }
  return DEV_SESSION_SECRET;
}
