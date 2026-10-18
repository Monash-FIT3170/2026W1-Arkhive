import { describe, it, expect } from 'vitest';
import {
  DEV_SESSION_SECRET,
  MISSING_SESSION_SECRET_ERROR,
  resolveSessionSecret,
} from './sessionSecret';

describe('resolveSessionSecret', () => {
  it('uses SESSION_SECRET when it is set', () => {
    expect(resolveSessionSecret({ SESSION_SECRET: 'real-secret', NODE_ENV: 'production' })).toBe(
      'real-secret'
    );
    expect(resolveSessionSecret({ SESSION_SECRET: 'local-secret', NODE_ENV: 'development' })).toBe(
      'local-secret'
    );
  });

  it('falls back to the dev secret outside production', () => {
    expect(resolveSessionSecret({ NODE_ENV: 'development' })).toBe(DEV_SESSION_SECRET);
    expect(resolveSessionSecret({})).toBe(DEV_SESSION_SECRET);
  });

  it('refuses to start in production when the secret is missing or blank', () => {
    expect(() => resolveSessionSecret({ NODE_ENV: 'production' })).toThrow(
      MISSING_SESSION_SECRET_ERROR
    );
    expect(() => resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: '   ' })).toThrow(
      MISSING_SESSION_SECRET_ERROR
    );
  });
});
