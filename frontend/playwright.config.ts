import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig } from '@playwright/test';
import { AUTH_STORAGE_STATE } from './e2e/constants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// E2E_TEST_USER_EMAIL/PASSWORD (and the real Supabase credentials
// e2e/globalSetup.ts passes through to the spawned backend) live in
// backend/.env, the single source of truth also used by
// backend/scripts/seedE2eUser.ts — load it here so this process and its
// workers have the same values.
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',

  // Spawns the real backend (port 3000, OCR_MODE=mock) and seeds the E2E
  // test user before any spec runs. See e2e/globalSetup.ts.
  globalSetup: './e2e/globalSetup.ts',

  use: {
    baseURL: 'http://localhost:5173',
  },

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      // Unauthenticated by default (matches smoke.spec.ts's and
      // upload-pipeline.spec.ts's guest-mode assumptions, and auth.spec.ts's
      // own login-flow assertions).
      name: 'default',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /projects\.spec\.ts/,
    },
    {
      // projects.spec.ts needs a real (non-guest) user, reused across its
      // tests via storageState instead of re-logging-in every test.
      name: 'authenticated',
      testMatch: /projects\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: AUTH_STORAGE_STATE },
    },
  ],
});