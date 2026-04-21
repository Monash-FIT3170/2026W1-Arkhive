import express, { Request, Response } from 'express';

const app = express();
app.use(express.json()) ;
const PORT = process.env.PORT || 3000;

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World');
});

app.listen(PORT, () => {
  console.log(`[server]: Server is running locally at :${PORT}`);
});