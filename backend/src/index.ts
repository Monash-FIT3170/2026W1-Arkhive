import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRoute from "./routes/chatRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173" })); // Vite default port
app.use(express.json());

app.use("/api/chat", chatRoute);

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});