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

const NUMBERED_ITEMS_PER_LINE = 5;

/**
 * Creation view: every character prefixed with its 1-based position ("1:石 2:の …"),
 * five per line, with hidden characters masked, so the hider can pick a position by
 * number instead of counting characters.
 */
export function renderNumberedText(sourceText: string, hiddenPositions: number[]): string {
  const hiddenSet = new Set(hiddenPositions);
  const items = Array.from(sourceText).map(
    (char, index) => `${index + 1}:${hiddenSet.has(index) ? MASK_CHAR : char}`,
  );
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += NUMBERED_ITEMS_PER_LINE) {
    lines.push(items.slice(i, i + NUMBERED_ITEMS_PER_LINE).join(" "));
  }
  return lines.join("\n");
}

export function isFullyRevealed(hiddenPositions: number[], revealedCount: number): boolean {
  return revealedCount >= hiddenPositions.length;
}
