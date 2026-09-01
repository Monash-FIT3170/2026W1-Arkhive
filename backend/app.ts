import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import app from './src/app';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running locally at ${PORT}`));

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function cleanupOldUploads() {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  const now = Date.now();
  for (const sessionFolder of fs.readdirSync(UPLOADS_DIR)) {
    const sessionPath = path.join(UPLOADS_DIR, sessionFolder);
    const stats = fs.statSync(sessionPath);
    if (stats.isDirectory() && now - stats.mtimeMs > THREE_DAYS_MS) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to cleanup session: ${sessionFolder}`, err);
      }
    }
  }
}

setInterval(cleanupOldUploads, 12 * 60 * 60 * 1000);
cleanupOldUploads();