import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import type { Transactor } from "../../repositories/Transactor.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { correctAnswerOf } from "../../domain/services/puzzleRound.js";
import { textMessage, withButtonsOnLast } from "../../lineMessages.js";
import type { AnswerSession } from "../../types.js";
import { answerButtons } from "../buttons.js";
import { formatScore, STALE_BUTTON_REPLY } from "../replies.js";

/**
 * 回答する: tapping the button puts that user into answer mode; their next plain-text
 * message is submitted as the answer (mode gate). Several users may be waiting at once.
 */
export class AnswerUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
    private readonly puzzlePreview: PuzzlePreviewService,
    private readonly transactor: Transactor,
  ) {}

  async enterAnswerMode(
    groupId: string,
    userId: string,
    sessionId: string,
  ): Promise<messagingApi.Message[]> {
    const session = await this.answerSessions.getActiveByGroup(groupId);
    if (!session || session.id !== sessionId) return [textMessage(STALE_BUTTON_REPLY)];

    // In a transaction so simultaneous taps by different users don't drop one another.
    await this.transactor.run(async (txn) => {
      const latest = await this.answerSessions.getByIdInTransaction(txn, sessionId);
      if (!latest || latest.answerModeUserIds.includes(userId)) return;
      this.answerSessions.updateInTransaction(txn, sessionId, {
        answerModeUserIds: [...latest.answerModeUserIds, userId],
      });
    });
    return [textMessage("回答を送ってください。次に送ったメッセージが回答になります。")];
  }

  /** Mode-gate value: the answer text from a user who tapped 回答する. */
  async submitAnswer(
    session: AnswerSession,
    userId: string,
    text: string,
  ): Promise<messagingApi.Message[]> {
    const answerText = text.trim();
    if (!answerText) {
      return [textMessage("回答が空です。1文字以上で送ってください。")];
    }

    const round = await this.puzzleRounds.getById(session.puzzleRoundId);
    if (!round) {
      throw new Error(`PuzzleRound not found for active session: ${session.puzzleRoundId}`);
    }

    // wrongAnswerCount/currentStepAttempts/answererIds are re-read and recomputed
    // inside AnswerFlowService.submitAnswer's own transaction (FEZ-166), so `session`
    // above is only used to locate the session/round; its counter fields may already
    // be stale by the time submitAnswer's transaction runs, and must not be used
    // to build the reply message below.
    const result = await this.answerFlow.submitAnswer(session.id, round, userId, answerText);

    if (result.outcome === "correct") {
      // The image itself isn't the answer text, so image rounds also spell it out.
      const answerLine = round.sourceType === "image" ? `正解: ${correctAnswerOf(round)}\n` : "";
      return this.puzzlePreview.compose(round, round.hiddenPositions.length, "challenge", {
        before: "正解です！",
        label: "答え",
        after: `${answerLine}結果: アウト（正解到達、${formatScore(result.score)}、記録済み）`,
      });
    }

    if (result.outcome === "wrong_limit") {
      return [
        textMessage(
          `誤答上限（${result.session.wrongAnswerLimit}回）に達しました。\n結果: アウト（${formatScore(result.score)}、記録済み）`,
        ),
      ];
    }

    if (result.outcome === "fully_revealed") {
      return this.puzzlePreview.compose(round, result.session.revealedCount, "challenge", {
        before: "不正解です。この位置での回答上限に達し、全開示となりました。",
        label: "最終状態",
        after: `結果: アウト（${formatScore(result.score)}、記録済み）`,
      });
    }

    if (result.outcome === "continue_revealed") {
      const messages = await this.puzzlePreview.compose(
        round,
        result.session.revealedCount,
        "challenge",
        {
          before: "不正解です。この位置での回答上限に達したため次を開示します。",
          label: "現在の状態",
          after: `誤答: ${result.session.wrongAnswerCount}/${result.session.wrongAnswerLimit}`,
        },
      );
      return withButtonsOnLast(messages, answerButtons(session.id));
    }

    const remainingAttempts =
      result.session.attemptsPerBlockLimit - result.session.currentStepAttempts;
    return withButtonsOnLast(
      [
        textMessage(
          `不正解です。この位置であと${remainingAttempts}回回答できます。誤答: ${result.session.wrongAnswerCount}/${result.session.wrongAnswerLimit}`,
        ),
      ],
      answerButtons(session.id),
    );
  }
}
