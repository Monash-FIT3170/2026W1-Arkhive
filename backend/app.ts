import express, { Request, RequestHandler, Response } from 'express';
import { extractTextFromSampleImage } from './src/services/ocr/ocr'
import apiRouter from "./src/routes/api"
import session from 'express-session';

const app = express();
app.use(express.json());

const sessionHandler: RequestHandler = session({
    secret: 'noOneWillfindoutaboutthishahaha',
    saveUninitialized: false,
    resave: false,
    cookie: {
        maxAge: 60000*60,
    }
})

app.use(sessionHandler);

const PORT = process.env.PORT || 3000;

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World');
});

// testing api endpoint
app.use('/api/', apiRouter);

app.listen(PORT, () => {
  console.log(`[server]: Server is running locally at :${PORT}`);
});