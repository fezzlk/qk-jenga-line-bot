export type CommandInput = {
  groupId: string;
  userId: string;
  /** Text following the command keyword, already trimmed. Empty string if none. */
  args: string;
};

export type CommandUseCase = {
  execute(input: CommandInput): Promise<string>;
};
