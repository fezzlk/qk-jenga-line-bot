function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  get lineChannelSecret(): string {
    return requireEnv("LINE_CHANNEL_SECRET");
  },
  get lineChannelAccessToken(): string {
    return requireEnv("LINE_CHANNEL_ACCESS_TOKEN");
  },
  // Optional overrides for the LINE API hosts, used only for local testing against
  // a mock (e.g. line-bot-playground). Unset means the real api.line.me / api-data.line.me.
  get lineApiBaseUrl(): string | undefined {
    return process.env.LINE_API_BASE_URL || undefined;
  },
  get lineApiDataBaseUrl(): string | undefined {
    return process.env.LINE_API_DATA_BASE_URL || process.env.LINE_API_BASE_URL || undefined;
  },
  // Private bucket for image puzzles. Only read when an image round is actually used,
  // so text-only deployments keep working without it.
  get puzzleImagesBucket(): string {
    return requireEnv("PUZZLE_IMAGES_BUCKET");
  },
};
