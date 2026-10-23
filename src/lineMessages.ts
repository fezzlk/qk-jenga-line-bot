import type { messagingApi } from "@line/bot-sdk";
import { encodePostback, type PostbackAction } from "./postback.js";

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

export type Button = { label: string; postback: PostbackAction };

/**
 * Attaches Quick Reply buttons backed by postbacks. displayText echoes the tapped label
 * into the chat so everyone in the group can see who chose what.
 */
export function withButtons(
  message: messagingApi.Message,
  buttons: Button[],
): messagingApi.Message {
  return {
    ...message,
    quickReply: {
      items: buttons.map(({ label, postback }) => ({
        type: "action",
        action: { type: "postback", label, data: encodePostback(postback), displayText: label },
      })),
    },
  };
}

/** Attaches buttons to the last message of a reply (LINE shows Quick Reply only there). */
export function withButtonsOnLast(
  messages: messagingApi.Message[],
  buttons: Button[],
): messagingApi.Message[] {
  if (messages.length === 0 || buttons.length === 0) return messages;
  return [...messages.slice(0, -1), withButtons(messages.at(-1)!, buttons)];
}

/** Concatenated text of every text message, for logging and tests. */
export function textOf(messages: messagingApi.Message[]): string {
  return messages
    .filter((m): m is messagingApi.TextMessage => m.type === "text")
    .map((m) => m.text)
    .join("\n");
}
