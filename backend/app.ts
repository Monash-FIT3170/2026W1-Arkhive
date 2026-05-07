import express, { Request, Response } from "express";
import session from "express-session";
import llmRoutes from "./src/routes/llmRoutes";
import extractionRoutes from "./src/routes/extractionRoutes";

const app = express();
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

app.use("/llm", llmRoutes);
app.use("/extraction", extractionRoutes);
app.use((req, res, next) => {
	console.log("HIT:", req.method, req.url);
	next();
});
app.listen(PORT, () => {
	console.log(`Server is running locally at ${PORT}`);
	console.log("http://localhost:3000/");
});
