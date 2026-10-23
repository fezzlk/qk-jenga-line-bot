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
  // Private bucket for image puzzles. Only read when an image round is actually used,
  // so text-only deployments keep working without it.
  get puzzleImagesBucket(): string {
    return requireEnv("PUZZLE_IMAGES_BUCKET");
  },
};
