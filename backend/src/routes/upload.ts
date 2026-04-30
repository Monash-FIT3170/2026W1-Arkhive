import {response, Router } from "express"

const uploadRouter = Router();

// /api/download
export default uploadRouter.post("/upload", (req, res) => {
  return res.status(204).send("image uploaded");
})
