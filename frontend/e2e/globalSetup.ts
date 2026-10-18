import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Spawns the real backend (not mocked Supabase, unlike the Vitest
// integration setup) on port 3000, since the frontend dev server's Vite
// proxy hardcodes /api -> http://localhost:3000. OCR is mocked (OCR_MODE)
// so the upload-pipeline spec is fast/deterministic/free; auth and project
// CRUD hit the real local Supabase instance configured in backend/.env.
//
// Can't run alongside a developer's own `npm run dev` backend (same port) —
// same tradeoff the frontend webServer already accepts via
// reuseExistingServer.

function waitForBackendReady(child: ChildProcessWithoutNullStreams): Promise<void> {
  let stderrBuffer = '';
  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
  });

  return new Promise<void>((resolve, reject) => {
    let stdoutBuffer = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Backend didn't start within 30s.\nstderr:\n${stderrBuffer}`));
    }, 30000);

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      if (stdoutBuffer.includes('Server is running locally at')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.once('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        if (stderrBuffer.includes('EADDRINUSE')) {
          reject(
            new Error(
              'Port 3000 is already in use, so the E2E backend could not start. ' +
                "This is usually a leftover backend process from a previous Playwright run that didn't " +
                'shut down cleanly (e.g. it was interrupted). Find and stop it (Windows: ' +
                '`netstat -ano | findstr :3000` then `taskkill /PID <pid> /F`), or stop your own ' +
                '`npm run dev` backend if that\'s what\'s running, then retry.'
            )
          );
          return;
        }
        reject(new Error(`Backend exited early (code ${code}).\nstderr:\n${stderrBuffer}`));
      }
    });
  });
}

function runSeedScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const seed = spawn('npx', ['tsx', 'scripts/seedE2eUser.ts'], {
      cwd: BACKEND_DIR,
      env: process.env,
      shell: true,
      stdio: 'inherit',
    });

    seed.once('error', reject);
    seed.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`seedE2eUser.ts exited with code ${code}`));
    });
  });
}

export default async function globalSetup() {
  const child: ChildProcessWithoutNullStreams = spawn(
    'node',
    ['--import', 'tsx', 'app.ts'],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PORT: '3000',
        OCR_MODE: 'mock',
        SESSION_SECRET: 'e2e-test-secret',
      },
    }
  );

  // If anything below fails, the child must still be killed here — once
  // globalSetup throws, Playwright never calls the teardown function
  // (it's only returned on success), so a failure that didn't kill the
  // child itself would leak an orphaned backend process squatting on
  // port 3000 for every subsequent run.
  try {
    await waitForBackendReady(child);
    await runSeedScript();
  } catch (err) {
    child.kill();
    throw err;
  }

  return async () => {
    child.kill();
  };
}
