import type { messagingApi } from "@line/bot-sdk";

export type CommandInput = {
  groupId: string;
  userId: string;
  /** Text following the command keyword, already trimmed. Empty string if none. */
  args: string;
};

// Replies are LINE messages rather than plain strings so image puzzles can send the
// masked image itself. Text-only replies are a single textMessage().
export type CommandUseCase = {
  execute(input: CommandInput): Promise<messagingApi.Message[]>;
};
