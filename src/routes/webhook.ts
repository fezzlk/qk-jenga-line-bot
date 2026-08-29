import { Router, type ErrorRequestHandler } from "express";
import {
  middleware,
  JSONParseError,
  SignatureValidationFailed,
  type WebhookRequestBody,
} from "@line/bot-sdk";
import { env } from "../config/env.js";
import { buildHandleLineEventUseCase } from "../composition.js";

// @line/bot-sdk's middleware() throws SignatureValidationFailed/JSONParseError
// synchronously-in-a-promise rather than calling next(err) with a status set,
// so without this handler an invalid/forged request crashes through to a bare
// 500 instead of the expected 401/400.
const handleWebhookError: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof SignatureValidationFailed) {
    res.status(401).send(err.message);
    return;
  }
  if (err instanceof JSONParseError) {
    res.status(400).send(err.message);
    return;
  }
  next(err);
};

export function createWebhookRouter(): Router {
  const router = Router();
  const handleLineEvent = buildHandleLineEventUseCase();

  router.post(
    "/callback",
    middleware({ channelSecret: env.lineChannelSecret }),
    async (req, res) => {
      const body = req.body as WebhookRequestBody;
      await Promise.all(body.events.map((event) => handleLineEvent.handle(event)));
      res.status(200).end();
    },
  );
  router.use(handleWebhookError);

  return router;
}
