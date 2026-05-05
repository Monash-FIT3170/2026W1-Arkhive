import {response, Router } from "express"

const downloadRouter = Router();

// /api/download
downloadRouter.post("/download", (req, res) => {
  return res.status(204).send("image downloaded");
})
