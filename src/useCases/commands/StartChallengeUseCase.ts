import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { textMessage, withButtonsOnLast } from "../../lineMessages.js";
import { answerButtons } from "../buttons.js";
import { formatScore } from "../replies.js";
import {
  DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT,
  DEFAULT_SCORE_CORRECT,
  DEFAULT_SCORE_FULLY_REVEALED,
  DEFAULT_SCORE_WRONG_LIMIT,
  DEFAULT_WRONG_ANSWER_LIMIT,
} from "../../types.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class StartChallengeUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async execute({ groupId, userId }: CommandInput): Promise<messagingApi.Message[]> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "ready_to_challenge");
    if (!round) {
      return [
        textMessage("挑戦できるパズルラウンドがありません。作成が完了しているか確認してください。"),
      ];
    }

    const session = await this.answerSessions.create({
      puzzleRoundId: round.id,
      groupId,
      answererIds: [userId],
      answerModeUserIds: [],
      revealedCount: 0,
      wrongAnswerCount: 0,
      currentStepAttempts: 0,
      wrongAnswerLimit: DEFAULT_WRONG_ANSWER_LIMIT,
      attemptsPerBlockLimit: DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT,
      scoreCorrect: DEFAULT_SCORE_CORRECT,
      scoreWrongLimit: DEFAULT_SCORE_WRONG_LIMIT,
      scoreFullyRevealed: DEFAULT_SCORE_FULLY_REVEALED,
      status: "active",
      startedAt: Date.now(),
      endedAt: null,
    });
    await this.puzzleRounds.update(round.id, { phase: "in_challenge" });

    const revealed = await this.answerFlow.revealNextBlock(session, round);

    if (revealed.session.status !== "active") {
      const score = revealed.score ?? 0;
      return this.puzzlePreview.compose(round, revealed.session.revealedCount, "challenge", {
        before: "挑戦を開始しましたが、1箇所しかない問題だったため即座に全開示となりました。",
        label: "最終状態",
        after: `結果: アウト（${formatScore(score)}、記録済み）`,
      });
    }

    const messages = await this.puzzlePreview.compose(
      round,
      revealed.session.revealedCount,
      "challenge",
      {
        before: "挑戦を開始しました。",
        label: "現在の状態",
        after:
          "答えが分かったら「回答する」、次を見たければ「スキップ」を押してください。\n" +
          `誤答上限: ${DEFAULT_WRONG_ANSWER_LIMIT}回 / 1箇所での回答上限: ${DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT}回`,
      },
    );
    return withButtonsOnLast(messages, answerButtons(session.id));
  }
}
