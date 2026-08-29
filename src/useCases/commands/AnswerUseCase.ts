import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { renderRevealedText } from "../../domain/services/textPuzzle.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class AnswerUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
  ) {}

  async execute({ groupId, userId, args }: CommandInput): Promise<string> {
    const session = await this.answerSessions.getActiveByGroup(groupId);
    if (!session) {
      return "進行中の挑戦がありません。「挑戦開始」で始めてください。";
    }
    if (session.answererId !== userId) {
      return "この挑戦の解答者ではありません（v1は解答者1人のみ対応）。";
    }
    const answerText = args.trim();
    if (!answerText) {
      return "回答内容を「回答 <内容>」の形式で送ってください。";
    }

    const round = await this.puzzleRounds.getById(session.puzzleRoundId);
    if (!round) {
      throw new Error(`PuzzleRound not found for active session: ${session.puzzleRoundId}`);
    }

    if (answerText === round.sourceText) {
      await this.answerFlow.endSession(session, round, "correct");
      const preview = renderRevealedText(round.sourceText, round.hiddenPositions, round.hiddenPositions.length);
      return `正解です！\n答え: ${preview}\n結果: アウト（正解到達、-1点、記録済み）`;
    }

    const wrongAnswerCount = session.wrongAnswerCount + 1;
    if (wrongAnswerCount >= session.wrongAnswerLimit) {
      await this.answerFlow.endSession(session, round, "wrong_limit", { wrongAnswerCount });
      return `誤答上限（${session.wrongAnswerLimit}回）に達しました。\n結果: アウト（-1点、記録済み）`;
    }

    const currentStepAttempts = session.currentStepAttempts + 1;
    if (currentStepAttempts >= session.attemptsPerBlockLimit) {
      await this.answerSessions.update(session.id, { wrongAnswerCount });
      const revealed = await this.answerFlow.revealNextBlock(
        { ...session, wrongAnswerCount },
        round,
      );
      const preview = renderRevealedText(round.sourceText, round.hiddenPositions, revealed.revealedCount);
      if (revealed.status !== "active") {
        return `不正解です。この位置での回答上限に達し、全開示となりました。\n最終状態: ${preview}\n結果: アウト（-1点、記録済み）`;
      }
      return `不正解です。この位置での回答上限に達したため次を開示します。\n現在の状態: ${preview}\n誤答: ${wrongAnswerCount}/${session.wrongAnswerLimit}`;
    }

    await this.answerSessions.update(session.id, { wrongAnswerCount, currentStepAttempts });
    const remainingAttempts = session.attemptsPerBlockLimit - currentStepAttempts;
    return `不正解です。この位置であと${remainingAttempts}回回答できます。誤答: ${wrongAnswerCount}/${session.wrongAnswerLimit}`;
  }
}
