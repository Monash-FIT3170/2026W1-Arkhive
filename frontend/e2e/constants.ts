// Shared between playwright.config.ts and fixtures/auth.setup.ts. Kept in
// its own file (rather than exported from auth.setup.ts) so the config file
// never imports a file that calls test()/setup() at module load time.
export const AUTH_STORAGE_STATE = 'e2e/.auth/user.json';
