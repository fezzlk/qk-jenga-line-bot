import type { messagingApi } from "@line/bot-sdk";

export type CommandInput = {
  groupId: string;
  userId: string;
};

// Commands are argument-free keywords (SPECIFICATION.md: no typed argument syntax);
// anything that needs a value is a button followed by a mode-gated message.
export type CommandUseCase = {
  execute(input: CommandInput): Promise<messagingApi.Message[]>;
};
