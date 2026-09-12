import express from "express";
import { env } from "./config/env.js";
import { createWebhookRouter } from "./routes/webhook.js";

const app = express();

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.use("/", createWebhookRouter());

app.listen(env.port, () => {
  console.log(`qk-jenga-line-bot listening on port ${env.port}`);
});
