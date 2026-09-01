import express, { Request, Response } from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import llmRoutes from './routes/llmRoutes';
import extractionRoutes from './routes/extractionRoutes';
import testRouter from './routes/testRoute';
import uploadRouter from './routes/upload';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'arkhive-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use('/api/llm', llmRoutes);
app.use('/api/extraction', extractionRoutes);
app.use('/api/upload', uploadRouter);
app.use('/api/test', testRouter);

app.use((req: Request, res: Response, next) => {
  console.log('HIT:', req.method, req.url);
  next();
});

// __dirname is now src/, so go up one level to reach the built frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/*splat', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

export default app;