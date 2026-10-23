import type { Button } from "../lineMessages.js";

// Quick Reply buttons offered at each step, shared by the use cases that reach that step.

export function recruitButtons(roundId: string): Button[] {
  return [
    { label: "参加する", postback: { action: "join", roundId } },
    { label: "締め切る", postback: { action: "close", roundId } },
  ];
}

export function hideButtons(roundId: string): Button[] {
  return [{ label: "隠す", postback: { action: "hide", roundId } }];
}

export function challengeButtons(): Button[] {
  return [{ label: "挑戦開始", postback: { action: "challenge" } }];
}

export function answerButtons(sessionId: string): Button[] {
  return [
    { label: "回答する", postback: { action: "answer", sessionId } },
    { label: "スキップ", postback: { action: "skip", sessionId } },
  ];
}
