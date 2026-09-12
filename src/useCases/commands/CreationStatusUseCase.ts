import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { renderRevealedText } from "../../domain/services/textPuzzle.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class CreationStatusUseCase implements CommandUseCase {
  constructor(private readonly puzzleRounds: PuzzleRoundRepository) {}

  async execute({ groupId }: CommandInput): Promise<string> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "creating");
    if (!round) {
      return "作成中のパズルラウンドがありません。";
    }
    const remaining = round.totalHideCount - round.hiddenPositions.length;
    const preview = renderRevealedText(round.sourceText, round.hiddenPositions, 0);
    const turnHint = round.lastHiderId
      ? "直前に隠した人以外が次の手番です。"
      : "誰でも最初の手番になれます。";
    return `現在の状態: ${preview}\n残り${remaining}箇所。${turnHint}`;
  }
}
