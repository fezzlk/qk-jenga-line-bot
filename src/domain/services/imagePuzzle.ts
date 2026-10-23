import type { ImageGridSize, ImagePuzzleRound } from "../../types.js";

export type CellRect = { x: number; y: number; width: number; height: number };

/** An image round whose setup ("preparing") is complete. */
export type ReadyImagePuzzleRound = ImagePuzzleRound & {
  sourceImagePath: string;
  gridSize: ImageGridSize;
  answerText: string;
};

export function cellCount(gridSize: ImageGridSize): number {
  return gridSize * gridSize;
}

export function isReadyImageRound(round: ImagePuzzleRound): round is ReadyImagePuzzleRound {
  return round.sourceImagePath !== null && round.gridSize !== null && round.answerText !== null;
}

export function requireReadyImageRound(round: ImagePuzzleRound): ReadyImagePuzzleRound {
  if (!isReadyImageRound(round)) {
    throw new Error(`Image round setup is incomplete: ${round.id}`);
  }
  return round;
}

/**
 * Grid cell indices still masked at this reveal step. Same reveal-order rule as
 * textPuzzle.ts's renderRevealedText: cells are revealed in the reverse of the order
 * they were hidden.
 */
export function maskedCellIndices(hiddenPositions: number[], revealedCount: number): number[] {
  const revealOrder = [...hiddenPositions].reverse();
  const revealedSet = new Set(revealOrder.slice(0, revealedCount));
  return hiddenPositions.filter((position) => !revealedSet.has(position));
}

/**
 * Pixel rectangle for row-major, 0-based grid cell `index`. Boundaries are computed from
 * fractions of the image size so adjacent cells never leave gaps or overlap when the
 * width/height isn't an exact multiple of gridSize.
 */
export function cellRect(
  index: number,
  gridSize: ImageGridSize,
  imageWidth: number,
  imageHeight: number,
): CellRect {
  if (!Number.isInteger(index) || index < 0 || index >= cellCount(gridSize)) {
    throw new Error(`cell index out of range: ${index}`);
  }
  const col = index % gridSize;
  const row = Math.floor(index / gridSize);
  const x0 = Math.floor((col * imageWidth) / gridSize);
  const x1 = Math.floor(((col + 1) * imageWidth) / gridSize);
  const y0 = Math.floor((row * imageHeight) / gridSize);
  const y1 = Math.floor(((row + 1) * imageHeight) / gridSize);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
