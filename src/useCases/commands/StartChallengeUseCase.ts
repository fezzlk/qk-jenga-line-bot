import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { renderRevealedText } from "../../domain/services/textPuzzle.js";
import { DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT, DEFAULT_WRONG_ANSWER_LIMIT } from "../../types.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class StartChallengeUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
  ) {}

  async execute({ groupId, userId }: CommandInput): Promise<string> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "ready_to_challenge");
    if (!round) {
      return "挑戦できるパズルラウンドがありません。作成が完了しているか確認してください。";
    }

    const session = await this.answerSessions.create({
      puzzleRoundId: round.id,
      groupId,
      answererId: userId,
      revealedCount: 0,
      wrongAnswerCount: 0,
      currentStepAttempts: 0,
      wrongAnswerLimit: DEFAULT_WRONG_ANSWER_LIMIT,
      attemptsPerBlockLimit: DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT,
      status: "active",
      startedAt: Date.now(),
      endedAt: null,
    });
    await this.puzzleRounds.update(round.id, { phase: "in_challenge" });

    const revealed = await this.answerFlow.revealNextBlock(session, round);
    const preview = renderRevealedText(round.sourceText, round.hiddenPositions, revealed.revealedCount);

    if (revealed.status !== "active") {
      return `挑戦を開始しましたが、1箇所しかない問題だったため即座に全開示となりました。\n最終状態: ${preview}\n結果: アウト（-1点、記録済み）`;
    }

    return (
      `挑戦を開始しました。\n現在の状態: ${preview}\n` +
      "「回答 <内容>」または「スキップ」を送ってください。\n" +
      `誤答上限: ${DEFAULT_WRONG_ANSWER_LIMIT}回 / 1箇所での回答上限: ${DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT}回`
    );
  }
}
