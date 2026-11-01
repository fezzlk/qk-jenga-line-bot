import express from "express";
import { env } from "./config/env.js";
import { createWebhookRouter } from "./routes/webhook.js";
import { buildBot } from "./composition.js";

const app = express();

// Not "/healthz": Cloud Run reserves some paths ending in "z" and answers them itself
// with a 404 before the request reaches the container.
app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

const { handler, playground } = buildBot();
if (playground) {
  app.use("/playground", playground.router);
  console.log("Playground plugin enabled at /playground");
}
app.use(
  "/",
  createWebhookRouter(
    handler,
    playground ? (events) => playground.service.recordRealEvents(events) : undefined,
  ),
);

app.listen(env.port, () => {
  console.log(`qk-jenga-line-bot listening on port ${env.port}`);
});
