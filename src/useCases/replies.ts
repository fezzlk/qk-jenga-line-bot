// Replies shared by several use cases.

export const STALE_BUTTON_REPLY =
  "このボタンは古くなっています。「作成状況」または「挑戦状況」で今の状態を確認してください。";

export function formatScore(score: number): string {
  return `${score >= 0 ? "+" : ""}${score}点`;
}
