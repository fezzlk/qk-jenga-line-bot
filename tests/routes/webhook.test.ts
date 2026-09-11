import { describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "@line/bot-sdk";
import { handleEventsSafely } from "../../src/routes/webhook.js";

function makeEvent(id: string): WebhookEvent {
  return {
    type: "message",
    mode: "active",
    timestamp: 0,
    source: { type: "user", userId: id },
    webhookEventId: id,
    deliveryContext: { isRedelivery: false },
    replyToken: `reply-${id}`,
    message: { id, type: "text", text: "回答 x", quoteToken: "q" },
  };
}

describe("handleEventsSafely", () => {
  it("does not reject when a single event's handling throws", async () => {
    const handleLineEvent = {
      handle: vi.fn(async (event: WebhookEvent) => {
        if (event.webhookEventId === "bad") {
          throw new Error("PuzzleRound not found for group");
        }
      }),
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      handleEventsSafely([makeEvent("bad")], handleLineEvent),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to handle LINE event",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("still processes every event when one of them throws", async () => {
    const handled: string[] = [];
    const handleLineEvent = {
      handle: vi.fn(async (event: WebhookEvent) => {
        if (event.webhookEventId === "bad") throw new Error("boom");
        handled.push(event.webhookEventId);
      }),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await handleEventsSafely(
      [makeEvent("ok-1"), makeEvent("bad"), makeEvent("ok-2")],
      handleLineEvent,
    );

    expect(handled).toEqual(["ok-1", "ok-2"]);
    vi.restoreAllMocks();
  });
});
