const llmController = require("../controller/llm");
const express = require("express");
const router = express.Router();

router.post("/chat", llmController.chatWithModel);

module.exports = router;
