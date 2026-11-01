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
  // Developer-only proxy sending as fictional users (src/playground). Off unless both
  // PLAYGROUND_ENABLED=true and PLAYGROUND_TOKEN are set.
  get playground(): { token: string; allowedGroups: Set<string> } | null {
    const token = process.env.PLAYGROUND_TOKEN;
    if (process.env.PLAYGROUND_ENABLED !== "true" || !token) return null;
    const allowedGroups = (process.env.PLAYGROUND_ALLOWED_GROUPS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return { token, allowedGroups: new Set(allowedGroups) };
  },
  // Private bucket for image puzzles. Only read when an image round is actually used,
  // so text-only deployments keep working without it.
  get puzzleImagesBucket(): string {
    return requireEnv("PUZZLE_IMAGES_BUCKET");
  },
};
