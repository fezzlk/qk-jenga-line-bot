import { describe, expect, it } from "vitest";
import { decodePostback, encodePostback, type PostbackAction } from "../src/postback.js";

describe("postback encoding", () => {
  const cases: PostbackAction[] = [
    { action: "type", sourceType: "text" },
    { action: "type", sourceType: "image" },
    { action: "type", sourceType: "template" },
    { action: "template", templateId: "2" },
    { action: "grid", roundId: "round-1", gridSize: 4 },
    { action: "join", roundId: "round-1" },
    { action: "close", roundId: "round-1" },
    { action: "hide", roundId: "round-1" },
    { action: "challenge" },
    { action: "answer", sessionId: "session-1" },
    { action: "skip", sessionId: "session-1" },
  ];

  it.each(cases)("round-trips %o", (postback) => {
    const data = encodePostback(postback);
    expect(data.length).toBeLessThanOrEqual(300);
    expect(decodePostback(data)).toEqual(postback);
  });

  it.each([
    "",
    "a=unknown",
    "a=type&k=video",
    "a=grid&r=round-1&n=6",
    "a=grid&n=3",
    "a=join",
    "a=answer",
    "a=template",
  ])("rejects malformed data %s", (data) => {
    expect(decodePostback(data)).toBeNull();
  });
});
