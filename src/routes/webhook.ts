import { Router, type ErrorRequestHandler } from "express";
import {
  middleware,
  JSONParseError,
  SignatureValidationFailed,
  type WebhookEvent,
  type WebhookRequestBody,
} from "@line/bot-sdk";
import { env } from "../config/env.js";
import { buildHandleLineEventUseCase } from "../composition.js";

type LineEventHandler = { handle(event: WebhookEvent): Promise<void> };

// Express 4 async route handlers don't forward promise rejections to
// next()/the error middleware, so a rejection here would otherwise become an
// unhandled rejection and crash the process (Node 20 default:
// --unhandled-rejections=throw). Catching per-event keeps one bad event
// (e.g. a missing PuzzleRound) from taking down in-flight handling of the
// others in the same batch, and still returns 200 so LINE doesn't retry.
export async function handleEventsSafely(
  events: WebhookEvent[],
  handleLineEvent: LineEventHandler,
): Promise<void> {
  await Promise.all(
    events.map((event) =>
      handleLineEvent.handle(event).catch((error: unknown) => {
        console.error("Failed to handle LINE event", error);
      }),
    ),
  );
}

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
      await handleEventsSafely(body.events, handleLineEvent);
      res.status(200).end();
    },
  );
  router.use(handleWebhookError);

  return router;
}
