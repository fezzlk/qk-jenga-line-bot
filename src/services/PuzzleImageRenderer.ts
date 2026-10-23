import sharp from "sharp";
import { cellCount, cellRect, maskedCellIndices } from "../domain/services/imagePuzzle.js";
import type { ImageGridSize } from "../types.js";

// Solid opaque block: nothing of the original can show through, unlike blur/pixelation.
const MASK_FILL = "#141414";

// Keeps stored sources well under LINE's 10MB image limit and cheap to re-render.
const SOURCE_MAX_DIMENSION = 2048;

// LINE's previewImageUrl is a small thumbnail shown before the image is opened.
const PREVIEW_MAX_DIMENSION = 240;

export type RenderedPuzzleImage = {
  /** For the LINE image message's originalContentUrl. */
  full: Buffer;
  /** For the LINE image message's previewImageUrl. */
  preview: Buffer;
};

export type RenderOptions = {
  /** Overlay 1-based cell numbers on the still-visible cells (creation phase only). */
  numbered: boolean;
};

/**
 * Bakes in EXIF orientation, caps the size and re-encodes as JPEG, so the stored source's
 * pixel dimensions are exactly what the grid math later sees.
 */
export async function normalizeSourceImage(rawImage: Buffer): Promise<Buffer> {
  return sharp(rawImage)
    .rotate()
    .resize({
      width: SOURCE_MAX_DIMENSION,
      height: SOURCE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function renderMaskedPuzzleImage(
  normalizedSourceImage: Buffer,
  gridSize: ImageGridSize,
  hiddenPositions: number[],
  revealedCount: number,
  options: RenderOptions,
): Promise<RenderedPuzzleImage> {
  const { width, height } = await sharp(normalizedSourceImage).metadata();
  if (!width || !height) {
    throw new Error("Source image has no readable pixel dimensions");
  }

  const svg = buildOverlaySvg(
    width,
    height,
    gridSize,
    maskedCellIndices(hiddenPositions, revealedCount),
    options,
  );
  const full = await sharp(normalizedSourceImage)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
  const preview = await sharp(full)
    .resize({ width: PREVIEW_MAX_DIMENSION, height: PREVIEW_MAX_DIMENSION, fit: "inside" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { full, preview };
}

function buildOverlaySvg(
  width: number,
  height: number,
  gridSize: ImageGridSize,
  maskedIndices: number[],
  { numbered }: RenderOptions,
): string {
  const masked = new Set(maskedIndices);
  const parts: string[] = [];

  for (const index of masked) {
    const r = cellRect(index, gridSize, width, height);
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${MASK_FILL}"/>`,
    );
  }

  const lineWidth = Math.max(2, Math.round(Math.min(width, height) / 300));
  for (let i = 1; i < gridSize; i++) {
    const x = Math.floor((i * width) / gridSize);
    const y = Math.floor((i * height) / gridSize);
    parts.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#ffffff" stroke-opacity="0.8" stroke-width="${lineWidth}"/>`,
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#ffffff" stroke-opacity="0.8" stroke-width="${lineWidth}"/>`,
    );
  }

  if (numbered) {
    for (let index = 0; index < cellCount(gridSize); index++) {
      if (masked.has(index)) continue;
      parts.push(cellNumberSvg(index + 1, cellRect(index, gridSize, width, height)));
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`;
}

// Digits are drawn as seven-segment strokes rather than SVG <text>: the production image
// (node:alpine) ships no fonts, so text would silently render as nothing.
//   a: top, b: upper right, c: lower right, d: bottom, e: lower left, f: upper left, g: middle
// Coordinates are in a 1 x 2 digit box.
const SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [0, 0, 1, 0],
  b: [1, 0, 1, 1],
  c: [1, 1, 1, 2],
  d: [0, 2, 1, 2],
  e: [0, 1, 0, 2],
  f: [0, 0, 0, 1],
  g: [0, 1, 1, 1],
};

const DIGIT_SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

function cellNumberSvg(
  label: number,
  cell: { x: number; y: number; width: number; height: number },
): string {
  const digits = String(label);
  const digitHeight = Math.max(12, Math.round(Math.min(cell.width, cell.height) * 0.22));
  const digitWidth = digitHeight / 2;
  const gap = digitWidth * 0.5;
  const stroke = Math.max(2, digitHeight / 8);
  const pad = Math.max(4, digitHeight * 0.25);
  const boxWidth = digits.length * digitWidth + (digits.length - 1) * gap + pad * 2;
  const boxHeight = digitHeight + pad * 2;
  const originX = cell.x + pad;
  const originY = cell.y + pad;

  const path = Array.from(digits)
    .map((digit, i) => {
      const dx = originX + pad + i * (digitWidth + gap);
      const dy = originY + pad;
      return Array.from(DIGIT_SEGMENTS[digit]!)
        .map((segment) => {
          const [x1, y1, x2, y2] = SEGMENTS[segment]!;
          const scale = digitWidth;
          return `M${dx + x1 * scale} ${dy + y1 * scale}L${dx + x2 * scale} ${dy + y2 * scale}`;
        })
        .join("");
    })
    .join("");

  return (
    `<rect x="${originX}" y="${originY}" width="${boxWidth}" height="${boxHeight}" rx="${pad}" fill="#000000" fill-opacity="0.6"/>` +
    `<path d="${path}" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>`
  );
}
