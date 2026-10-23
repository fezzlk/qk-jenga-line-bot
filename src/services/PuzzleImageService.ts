import { randomUUID } from "node:crypto";
import { ImageStorageService } from "./ImageStorageService.js";
import {
  normalizeSourceImage,
  renderMaskedPuzzleImage,
  type RenderOptions,
} from "./PuzzleImageRenderer.js";
import type { ReadyImagePuzzleRound } from "../domain/services/imagePuzzle.js";

export type ImageUrls = { originalContentUrl: string; previewImageUrl: string };

/** What use cases need from image storage + rendering; tests substitute an in-memory fake. */
export type PuzzleImageStore = {
  /** Normalizes and stores a newly submitted source image, returning its storage path. */
  storeSourceImage(rawImage: Buffer): Promise<string>;
  /** Renders the given reveal step and returns signed HTTPS URLs LINE can fetch. */
  renderStep(
    round: ReadyImagePuzzleRound,
    revealedCount: number,
    options: RenderOptions,
  ): Promise<ImageUrls>;
};

/**
 * Every object lives under `puzzle-images/{uuid}/` and is disposable; cleanup is the
 * bucket's lifecycle rule, so nothing here deletes explicitly.
 */
export class PuzzleImageService implements PuzzleImageStore {
  constructor(private readonly storage: ImageStorageService) {}

  async storeSourceImage(rawImage: Buffer): Promise<string> {
    const normalized = await normalizeSourceImage(rawImage);
    const path = `puzzle-images/${randomUUID()}/source.jpg`;
    await this.storage.upload(path, normalized, "image/jpeg");
    return path;
  }

  async renderStep(
    round: ReadyImagePuzzleRound,
    revealedCount: number,
    options: RenderOptions,
  ): Promise<ImageUrls> {
    const source = await this.storage.download(round.sourceImagePath);
    const rendered = await renderMaskedPuzzleImage(
      source,
      round.gridSize,
      round.hiddenPositions,
      revealedCount,
      options,
    );

    // Unique per render: LINE clients cache by URL, and the same step can look different
    // (creation view is numbered, challenge view is not).
    const prefix = `${round.sourceImagePath.replace(/\/source\.jpg$/, "")}/${randomUUID()}`;
    const fullPath = `${prefix}-full.jpg`;
    const previewPath = `${prefix}-preview.jpg`;
    await Promise.all([
      this.storage.upload(fullPath, rendered.full, "image/jpeg"),
      this.storage.upload(previewPath, rendered.preview, "image/jpeg"),
    ]);

    const [originalContentUrl, previewImageUrl] = await Promise.all([
      this.storage.getSignedUrl(fullPath),
      this.storage.getSignedUrl(previewPath),
    ]);
    return { originalContentUrl, previewImageUrl };
  }
}
