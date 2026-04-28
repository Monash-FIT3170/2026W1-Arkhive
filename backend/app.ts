import express, { Request, RequestHandler, Response } from 'express';
import apiRouter from "./src/routes/api"
import session from 'express-session';
import multer from 'multer'
import uploadRouter from './src/routes/upload'

const uploads = multer({ dest: 'uploads/' })

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

app.use('/uploads', uploads.single('table_input'), uploadRouter)

// testing api endpoint
app.use('/api/', apiRouter);

app.listen(PORT, () => {
  console.log(`Server is running locally at ${PORT}`);
  console.log('Test OCR at http://localhost:3000/api/ocr/test');
});