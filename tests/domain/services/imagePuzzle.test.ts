import { describe, expect, it } from "vitest";
import {
  cellCount,
  cellRect,
  correctAnswerOf,
  maskedCellIndices,
} from "../../../src/domain/services/imagePuzzle.js";
import { IMAGE_GRID_SIZES, type ImagePuzzleRound } from "../../../src/types.js";

function imageRound(overrides: Partial<ImagePuzzleRound> = {}): ImagePuzzleRound {
  return {
    id: "r1",
    groupId: "g1",
    sourceType: "image",
    creatorId: "u1",
    sourceImagePath: "puzzle-images/x/source.jpg",
    gridSize: 3,
    answerText: "東京タワー",
    totalHideCount: 9,
    participantIds: [],
    lastHiderId: null,
    hiddenPositions: [],
    phase: "creating",
    createdAt: 0,
    ...overrides,
  };
}

describe("cellRect", () => {
  it.each(IMAGE_GRID_SIZES)(
    "tiles a %ix%i grid over an odd-sized image without gaps or overlaps",
    (gridSize) => {
      const width = 1003;
      const height = 757;
      const covered = new Uint8Array(width * height);
      for (let index = 0; index < cellCount(gridSize); index++) {
        const r = cellRect(index, gridSize, width, height);
        for (let y = r.y; y < r.y + r.height; y++) {
          for (let x = r.x; x < r.x + r.width; x++) covered[y * width + x]! += 1;
        }
      }
      expect(covered.every((count) => count === 1)).toBe(true);
    },
  );

  it("numbers cells row-major from the top-left", () => {
    expect(cellRect(0, 4, 400, 400)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(cellRect(5, 4, 400, 400)).toEqual({ x: 100, y: 100, width: 100, height: 100 });
    expect(cellRect(15, 4, 400, 400)).toEqual({ x: 300, y: 300, width: 100, height: 100 });
  });

  it("rejects out-of-range indices", () => {
    expect(() => cellRect(25, 5, 100, 100)).toThrow();
    expect(() => cellRect(-1, 3, 100, 100)).toThrow();
  });
});

describe("maskedCellIndices", () => {
  it("reveals cells in the reverse of the order they were hidden", () => {
    const hidden = [4, 0, 8];
    expect(maskedCellIndices(hidden, 0)).toEqual([4, 0, 8]);
    expect(maskedCellIndices(hidden, 1)).toEqual([4, 0]);
    expect(maskedCellIndices(hidden, 2)).toEqual([4]);
    expect(maskedCellIndices(hidden, 3)).toEqual([]);
  });
});

describe("correctAnswerOf", () => {
  it("uses the registered answer for image rounds and the text itself for text rounds", () => {
    expect(correctAnswerOf(imageRound())).toBe("東京タワー");
    expect(
      correctAnswerOf({ ...imageRound(), sourceType: "text", sourceText: "一石二鳥" } as never),
    ).toBe("一石二鳥");
  });

  it("refuses an image round whose setup is incomplete", () => {
    expect(() => correctAnswerOf(imageRound({ answerText: null }))).toThrow();
  });
});
