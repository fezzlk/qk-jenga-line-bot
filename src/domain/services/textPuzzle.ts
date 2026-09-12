const MASK_CHAR = "＿";

/**
 * Renders sourceText for the current reveal step. Characters never included in
 * hiddenPositions were never hidden and always show. Characters in hiddenPositions
 * are masked until revealed, in the order given by hiddenPositions reversed
 * (SPECIFICATION.md: "開示時は逆順に使われる想定").
 */
export function renderRevealedText(
  sourceText: string,
  hiddenPositions: number[],
  revealedCount: number,
): string {
  const hiddenSet = new Set(hiddenPositions);
  const revealOrder = [...hiddenPositions].reverse();
  const revealedIndices = new Set(revealOrder.slice(0, revealedCount));

  return Array.from(sourceText)
    .map((char, index) => {
      if (!hiddenSet.has(index)) return char;
      return revealedIndices.has(index) ? char : MASK_CHAR;
    })
    .join("");
}

export function isFullyRevealed(hiddenPositions: number[], revealedCount: number): boolean {
  return revealedCount >= hiddenPositions.length;
}
