import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_BACKEND_PORT } from './constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, '../../../backend');

export default async function setup() {
  const child: ChildProcessWithoutNullStreams = spawn(
    'node',
    ['--import', 'tsx', 'app.ts'],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PORT: String(TEST_BACKEND_PORT),
        OCR_MODE: 'mock',
        SESSION_SECRET: 'integration-test-secret',
      },
    }
  );

  let stderrBuffer = '';
  child.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString(); });

  await new Promise<void>((resolve, reject) => {
    let stdoutBuffer = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Backend didn't start within 15s.\nstderr:\n${stderrBuffer}`));
    }, 15000);

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
        reject(new Error(`Backend exited early (code ${code}).\nstderr:\n${stderrBuffer}`));
      }
    });
  });

  return async () => {
    child.kill();
  };
}