import express from "express";
import { env } from "./config/env.js";
import { createWebhookRouter } from "./routes/webhook.js";

const app = express();

// Not "/healthz": Cloud Run reserves some paths ending in "z" and answers them itself
// with a 404 before the request reaches the container.
app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.use("/", createWebhookRouter());

app.listen(env.port, () => {
  console.log(`qk-jenga-line-bot listening on port ${env.port}`);
});
