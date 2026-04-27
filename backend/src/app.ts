import express, { Request, Response } from "express";
const llmRoutes = require("./routes/llmRoutes");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

app.use("/llm", llmRoutes);

app.listen(PORT, () => {
	console.log(`Server is running locally at ${PORT}`);
	console.log("http://localhost:3000/");
});
