import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { correctAnswerOf } from "../../domain/services/imagePuzzle.js";
import { textMessage } from "../../lineMessages.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class AnswerUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async execute({ groupId, userId, args }: CommandInput): Promise<messagingApi.Message[]> {
    const session = await this.answerSessions.getActiveByGroup(groupId);
    if (!session) {
      return [textMessage("進行中の挑戦がありません。「挑戦開始」で始めてください。")];
    }
    const answerText = args.trim();
    if (!answerText) {
      return [textMessage("回答内容を「回答 <内容>」の形式で送ってください。")];
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
        after: `${answerLine}結果: アウト（正解到達、${result.score >= 0 ? "+" : ""}${result.score}点、記録済み）`,
      });
    }

    if (result.outcome === "wrong_limit") {
      return [
        textMessage(
          `誤答上限（${result.session.wrongAnswerLimit}回）に達しました。\n結果: アウト（${result.score >= 0 ? "+" : ""}${result.score}点、記録済み）`,
        ),
      ];
    }

    if (result.outcome === "fully_revealed") {
      return this.puzzlePreview.compose(round, result.session.revealedCount, "challenge", {
        before: "不正解です。この位置での回答上限に達し、全開示となりました。",
        label: "最終状態",
        after: `結果: アウト（${result.score >= 0 ? "+" : ""}${result.score}点、記録済み）`,
      });
    }

    if (result.outcome === "continue_revealed") {
      return this.puzzlePreview.compose(round, result.session.revealedCount, "challenge", {
        before: "不正解です。この位置での回答上限に達したため次を開示します。",
        label: "現在の状態",
        after: `誤答: ${result.session.wrongAnswerCount}/${result.session.wrongAnswerLimit}`,
      });
    }

    const remainingAttempts =
      result.session.attemptsPerBlockLimit - result.session.currentStepAttempts;
    return [
      textMessage(
        `不正解です。この位置であと${remainingAttempts}回回答できます。誤答: ${result.session.wrongAnswerCount}/${result.session.wrongAnswerLimit}`,
      ),
    ];
  }
}
