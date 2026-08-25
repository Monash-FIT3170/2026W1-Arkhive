import "dotenv/config";
import express, { Request, Response } from "express";
import session from "express-session";
import path from "path";
import llmRoutes from "./src/routes/llmRoutes";
import extractionRoutes from "./src/routes/extractionRoutes";
import uploadRouter from "./src/routes/upload";

//
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "arkhive-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

const PORT = process.env.PORT || 3000;

app.use("/api/llm", llmRoutes);
app.use("/api/extraction", extractionRoutes);
app.use("/api/upload", uploadRouter);

app.use((req: Request, res: Response, next) => {
  console.log("HIT:", req.method, req.url);
  next();
});

// Serve the built frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/*splat", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running locally at ${PORT}`);
});

// Cleanup old uploads (older than 3 days)
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function cleanupOldUploads() {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  
  const now = Date.now();
  const sessions = fs.readdirSync(UPLOADS_DIR);
  
  for (const sessionFolder of sessions) {
    const sessionPath = path.join(UPLOADS_DIR, sessionFolder);
    const stats = fs.statSync(sessionPath);
    
    // Check if it's a directory and older than 3 days
    if (stats.isDirectory() && (now - stats.mtimeMs > THREE_DAYS_MS)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`Cleaned up expired session uploads: ${sessionFolder}`);
      } catch (err) {
        console.error(`Failed to cleanup session: ${sessionFolder}`, err);
      }
    }
  }
}

// Run cleanup every 12 hours
setInterval(cleanupOldUploads, 12 * 60 * 60 * 1000);
// Run once on startup
cleanupOldUploads();