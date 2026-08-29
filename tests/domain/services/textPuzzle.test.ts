import { describe, expect, it } from "vitest";
import { isFullyRevealed, renderRevealedText } from "../../../src/domain/services/textPuzzle.js";

describe("renderRevealedText", () => {
  it("keeps characters never hidden always visible", () => {
    // "abc" with only index 1 ever hidden
    expect(renderRevealedText("abc", [1], 0)).toBe("a＿c");
  });

  it("masks everything hidden when revealedCount is 0", () => {
    expect(renderRevealedText("abc", [0, 1, 2], 0)).toBe("＿＿＿");
  });

  it("reveals hidden characters in reverse of hidden order", () => {
    // hidden order: 0, 1, 2 -> reveal order: 2, 1, 0
    expect(renderRevealedText("abc", [0, 1, 2], 1)).toBe("＿＿c");
    expect(renderRevealedText("abc", [0, 1, 2], 2)).toBe("＿bc");
    expect(renderRevealedText("abc", [0, 1, 2], 3)).toBe("abc");
  });
});

describe("isFullyRevealed", () => {
  it("is false until revealedCount reaches hiddenPositions length", () => {
    expect(isFullyRevealed([0, 1, 2], 2)).toBe(false);
    expect(isFullyRevealed([0, 1, 2], 3)).toBe(true);
    expect(isFullyRevealed([0, 1, 2], 4)).toBe(true);
  });
});
