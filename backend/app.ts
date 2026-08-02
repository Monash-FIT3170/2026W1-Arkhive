import express, { Request, Response } from "express";
import session from "express-session";
import path from "path";
import llmRoutes from "./src/routes/llmRoutes";
import extractionRoutes from "./src/routes/extractionRoutes";
import uploadRouter from "./src/routes/upload";

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

app.use("api/llm", llmRoutes);
app.use("api/extraction", extractionRoutes);
app.use("api/upload", uploadRouter);

app.use((req: Request, res: Response, next) => {
  console.log("HIT:", req.method, req.url);
  next();
});

// Serve the built frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running locally at ${PORT}`);
});