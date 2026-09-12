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
};
