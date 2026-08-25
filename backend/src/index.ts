import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import chatRoute from "./routes/llmRoutes";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173" })); // still fine to keep for local dev
app.use(express.json());

app.use("/api/chat", chatRoute);

// Serve the built frontend
app.use(express.static(path.join(__dirname, "../public")));

app.get("*", (req, res) => {
	res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
	console.log(`Backend running on http://localhost:${PORT}`);
});