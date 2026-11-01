import { createHash, timingSafeEqual } from "node:crypto";
import express, { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import {
  PlaygroundError,
  type PlaygroundAction,
  type PlaygroundService,
} from "./PlaygroundService.js";
import type { PlaygroundStore } from "./store.js";

/** Version of the controller ↔ plugin protocol (line-bot-playground docs/protocol.md). */
export const PLAYGROUND_PROTOCOL_VERSION = 1;

function sameToken(given: string, expected: string): boolean {
  // Hash first so the comparison takes the same time whatever the lengths are.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function parseAction(raw: unknown): PlaygroundAction {
  const a = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  switch (a.type) {
    case "text":
      if (str(a.text)) return { type: "text", text: a.text as string };
      break;
    case "image":
      if (str(a.base64)) return { type: "image", base64: a.base64 as string };
      break;
    case "postback":
      if (typeof a.data === "string") {
        const params =
          a.params && typeof a.params === "object"
            ? (a.params as Record<string, string>)
            : undefined;
        return { type: "postback", data: a.data, displayText: str(a.displayText), params };
      }
      break;
    case "memberJoined":
      return { type: "memberJoined" };
  }
  throw new PlaygroundError(400, "Invalid action");
}

const asyncRoute =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** HTTP endpoints the line-bot-playground controller calls. Mount only when the plugin is enabled. */
export function createPlaygroundRouter(opts: {
  token: string;
  botName: string;
  store: PlaygroundStore;
  service: PlaygroundService;
}): Router {
  const { store, service } = opts;
  const router = Router();

  router.use((req, res, next) => {
    const given = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!sameToken(given, opts.token)) {
      res.status(401).json({ error: "Invalid playground token" });
      return;
    }
    next();
  });
  // Images arrive as base64, so allow more than the default 100kb.
  router.use(express.json({ limit: "10mb" }));

  router.get("/info", (_req, res) => {
    res.json({ protocol: PLAYGROUND_PROTOCOL_VERSION, bot: opts.botName });
  });

  router.get(
    "/groups",
    asyncRoute(async (_req, res) => {
      res.json({ groups: await service.listGroups() });
    }),
  );

  router.get(
    "/groups/:groupId/users",
    asyncRoute(async (req, res) => {
      res.json({ users: await store.listUsers(req.params.groupId!) });
    }),
  );

  router.post(
    "/groups/:groupId/users",
    asyncRoute(async (req, res) => {
      const groupId = req.params.groupId!;
      if (!service.isAllowed(groupId))
        throw new PlaygroundError(403, "This group is not in PLAYGROUND_ALLOWED_GROUPS");
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) throw new PlaygroundError(400, "name is required");
      res.json(await store.addUser(groupId, name));
    }),
  );

  router.patch(
    "/groups/:groupId/users/:userId",
    asyncRoute(async (req, res) => {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) throw new PlaygroundError(400, "name is required");
      const existing = await store.getUser(req.params.userId!);
      if (!existing || existing.groupId !== req.params.groupId)
        throw new PlaygroundError(404, "Unknown playground user");
      res.json(await store.renameUser(existing.userId, name));
    }),
  );

  router.get(
    "/groups/:groupId/messages",
    asyncRoute(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
      res.json({ messages: await service.listLog(req.params.groupId!, limit) });
    }),
  );

  router.post(
    "/send",
    asyncRoute(async (req, res) => {
      const { groupId, userId } = req.body ?? {};
      if (typeof groupId !== "string" || typeof userId !== "string") {
        throw new PlaygroundError(400, "groupId and userId are required");
      }
      res.json(await service.send(groupId, userId, parseAction(req.body.action)));
    }),
  );

  const onError: ErrorRequestHandler = (err, _req, res, next) => {
    if (err instanceof PlaygroundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  };
  router.use(onError);
  return router;
}
