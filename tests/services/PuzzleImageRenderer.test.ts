import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  normalizeSourceImage,
  renderMaskedPuzzleImage,
} from "../../src/services/PuzzleImageRenderer.js";

const WIDTH = 300;
const HEIGHT = 300;

async function solidImage(width = WIDTH, height = HEIGHT): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 230, g: 40, b: 40 } } })
    .jpeg()
    .toBuffer();
}

/** Mean RGB over a small square around (x, y), robust to JPEG noise. */
async function sampleRgb(image: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data } = await sharp(image)
    .extract({ left: x - 5, top: y - 5, width: 10, height: 10 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 3) {
    sum[0]! += data[i]!;
    sum[1]! += data[i + 1]!;
    sum[2]! += data[i + 2]!;
  }
  const n = data.length / 3;
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

describe("renderMaskedPuzzleImage", () => {
  it("blacks out still-hidden cells and leaves revealed and never-hidden cells intact", async () => {
    const source = await solidImage();
    // 3x3 grid, 100px cells. Hidden in order 4 (center), 0 (top-left); one step revealed,
    // so cell 0 (hidden last) is visible again and cell 4 is still masked.
    const { full } = await renderMaskedPuzzleImage(source, 3, [4, 0], 1, { numbered: false });

    const center = await sampleRgb(full, 150, 150);
    const topLeft = await sampleRgb(full, 50, 60);
    const bottomRight = await sampleRgb(full, 250, 250);
    expect(Math.max(...center)).toBeLessThan(40);
    expect(topLeft[0]).toBeGreaterThan(180);
    expect(bottomRight[0]).toBeGreaterThan(180);
  });

  it("keeps the source size and produces a small preview", async () => {
    const { full, preview } = await renderMaskedPuzzleImage(await solidImage(800, 600), 5, [], 0, {
      numbered: true,
    });
    expect(await sharp(full).metadata()).toMatchObject({ width: 800, height: 600, format: "jpeg" });
    const previewMeta = await sharp(preview).metadata();
    expect(Math.max(previewMeta.width!, previewMeta.height!)).toBeLessThanOrEqual(240);
  });

  it("draws cell numbers without relying on fonts", async () => {
    const source = await solidImage();
    const plain = await renderMaskedPuzzleImage(source, 3, [], 0, { numbered: false });
    const numbered = await renderMaskedPuzzleImage(source, 3, [], 0, { numbered: true });
    // The number badge sits in each cell's top-left corner.
    const plainCorner = await sampleRgb(plain.full, 14, 18);
    const numberedCorner = await sampleRgb(numbered.full, 14, 18);
    expect(plainCorner[0]).toBeGreaterThan(180);
    expect(numberedCorner[0]).toBeLessThan(plainCorner[0] - 40);
  });
});

describe("normalizeSourceImage", () => {
  it("caps very large images", async () => {
    const normalized = await normalizeSourceImage(await solidImage(4000, 1000));
    expect(await sharp(normalized).metadata()).toMatchObject({ width: 2048, height: 512 });
  });
});
