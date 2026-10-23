import { IMAGE_GRID_SIZES, type ImageGridSize } from "./types.js";

/**
 * Button actions, carried as postback data. Buttons tied to a specific round/session
 * carry its id, so a tap on a button from an earlier round can be told apart and
 * rejected instead of acting on whatever round is current now.
 */
export type PostbackAction =
  | { action: "type"; sourceType: "text" | "image" | "template" }
  | { action: "template"; templateId: string }
  | { action: "grid"; roundId: string; gridSize: ImageGridSize }
  | { action: "join"; roundId: string }
  | { action: "close"; roundId: string }
  | { action: "hide"; roundId: string }
  | { action: "challenge" }
  | { action: "answer"; sessionId: string }
  | { action: "skip"; sessionId: string };

// Short keys keep the data well under LINE's 300-character postback limit.
export function encodePostback(postback: PostbackAction): string {
  const params = new URLSearchParams({ a: postback.action });
  switch (postback.action) {
    case "type":
      params.set("k", postback.sourceType);
      break;
    case "template":
      params.set("t", postback.templateId);
      break;
    case "grid":
      params.set("r", postback.roundId);
      params.set("n", String(postback.gridSize));
      break;
    case "join":
    case "close":
    case "hide":
      params.set("r", postback.roundId);
      break;
    case "answer":
    case "skip":
      params.set("s", postback.sessionId);
      break;
    case "challenge":
      break;
  }
  return params.toString();
}

/** Returns null for anything malformed or unknown (e.g. data from an older bot version). */
export function decodePostback(data: string): PostbackAction | null {
  const params = new URLSearchParams(data);
  const roundId = params.get("r");
  const sessionId = params.get("s");
  switch (params.get("a")) {
    case "type": {
      const sourceType = params.get("k");
      if (sourceType === "text" || sourceType === "image" || sourceType === "template") {
        return { action: "type", sourceType };
      }
      return null;
    }
    case "template": {
      const templateId = params.get("t");
      return templateId ? { action: "template", templateId } : null;
    }
    case "grid": {
      const gridSize = IMAGE_GRID_SIZES.find((size) => String(size) === params.get("n"));
      return roundId && gridSize ? { action: "grid", roundId, gridSize } : null;
    }
    case "join":
    case "close":
    case "hide":
      return roundId ? { action: params.get("a") as "join" | "close" | "hide", roundId } : null;
    case "challenge":
      return { action: "challenge" };
    case "answer":
    case "skip":
      return sessionId ? { action: params.get("a") as "answer" | "skip", sessionId } : null;
    default:
      return null;
  }
}
