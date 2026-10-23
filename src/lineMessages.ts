import type { messagingApi } from "@line/bot-sdk";

// Shared LINE message constructors, used by both use cases and PuzzlePreviewService.

export function textMessage(text: string): messagingApi.Message {
  return { type: "text", text };
}

export function imageMessage(
  originalContentUrl: string,
  previewImageUrl: string,
): messagingApi.Message {
  return { type: "image", originalContentUrl, previewImageUrl };
}

/**
 * Attaches Quick Reply buttons that each send their label back as a plain text message,
 * so choices can be picked by tapping instead of typing (no postback handling needed).
 */
export function withQuickReplies(
  message: messagingApi.Message,
  labels: string[],
): messagingApi.Message {
  return {
    ...message,
    quickReply: {
      items: labels.map((label) => ({
        type: "action",
        action: { type: "message", label, text: label },
      })),
    },
  };
}

/** Concatenated text of every text message, for logging and tests. */
export function textOf(messages: messagingApi.Message[]): string {
  return messages
    .filter((m): m is messagingApi.TextMessage => m.type === "text")
    .map((m) => m.text)
    .join("\n");
}
