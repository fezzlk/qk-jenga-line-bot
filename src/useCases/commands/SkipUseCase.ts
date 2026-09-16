import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { renderRevealedText } from "../../domain/services/textPuzzle.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class SkipUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
  ) {}

  async execute({ groupId, userId }: CommandInput): Promise<string> {
    const session = await this.answerSessions.getActiveByGroup(groupId);
    if (!session) {
      return "進行中の挑戦がありません。「挑戦開始」で始めてください。";
    }
    const round = await this.puzzleRounds.getById(session.puzzleRoundId);
    if (!round) {
      throw new Error(`PuzzleRound not found for active session: ${session.puzzleRoundId}`);
    }

    // 先着順: 誰でもスキップを試みられる。未参加なら参加者リストへ動的に加える。
    const answererIds = session.answererIds.includes(userId)
      ? session.answererIds
      : [...session.answererIds, userId];

    const revealed = await this.answerFlow.revealNextBlock(session, round, { answererIds });
    const preview = renderRevealedText(round.sourceText, round.hiddenPositions, revealed.session.revealedCount);
    if (revealed.session.status !== "active") {
      const score = revealed.score ?? 0;
      return `スキップしました。全開示となりました。\n最終状態: ${preview}\n結果: アウト（${score >= 0 ? "+" : ""}${score}点、記録済み）`;
    }
    return `スキップしました。\n現在の状態: ${preview}`;
  }
}
