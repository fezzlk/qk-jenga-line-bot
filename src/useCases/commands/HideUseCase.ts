import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { renderRevealedText } from "../../domain/services/textPuzzle.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class HideUseCase implements CommandUseCase {
  constructor(private readonly puzzleRounds: PuzzleRoundRepository) {}

  async execute({ groupId, userId, args }: CommandInput): Promise<string> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "creating");
    if (!round) {
      return "作成中のパズルラウンドがありません。「問題作成開始 <問題文>」で始めてください。";
    }

    if (round.lastHiderId === userId) {
      return "直前の手番と同じ人は連続で隠せません。他の人の番です。";
    }

    const position = Number.parseInt(args.trim(), 10);
    if (!Number.isInteger(position) || position < 1 || position > round.totalHideCount) {
      return `1〜${round.totalHideCount}の文字位置を指定してください（例: 隠す 3）。`;
    }
    const zeroBasedPosition = position - 1;
    if (round.hiddenPositions.includes(zeroBasedPosition)) {
      return "その位置はすでに隠されています。別の位置を指定してください。";
    }

    const hiddenPositions = [...round.hiddenPositions, zeroBasedPosition];
    const participantIds = round.participantIds.includes(userId)
      ? round.participantIds
      : [...round.participantIds, userId];
    const complete = hiddenPositions.length >= round.totalHideCount;

    await this.puzzleRounds.update(round.id, {
      hiddenPositions,
      participantIds,
      lastHiderId: userId,
      phase: complete ? "ready_to_challenge" : "creating",
    });

    if (complete) {
      return `${round.totalHideCount}箇所すべて隠し終えました。作成完了です。「挑戦開始」で解答フェーズに進めます。`;
    }
    const remaining = round.totalHideCount - hiddenPositions.length;
    const preview = renderRevealedText(round.sourceText, hiddenPositions, 0);
    return `隠しました。残り${remaining}箇所です。\n現在の状態: ${preview}`;
  }
}
