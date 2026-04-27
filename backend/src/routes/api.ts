import {response, Router } from "express"

const apiRouter = Router();

// /api/download
apiRouter.post("/api/txtOutput", (req, res) => {
  return res.status(204).send("image sent to be txt processed");
});

apiRouter.post("/api/csvOutput", (req, res) => {
  return res.status(204).send("image sent to be csv processed");
});

apiRouter.patch("/api/changeDataFields", (req, res) => {
  return res.status(204).send("JSON has been modified based on request");
})