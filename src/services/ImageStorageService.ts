import { getStorage } from "firebase-admin/storage";
import { getOrInitApp } from "../config/firebase.js";
import { env } from "../config/env.js";

// Signed URLs let LINE fetch objects from a private bucket without making them public.
// One hour comfortably covers the gap between replying and LINE fetching the image.
const SIGNED_URL_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Thin wrapper over the private PUZZLE_IMAGES_BUCKET bucket. Retention is handled by the
 * bucket's 7-day auto-delete lifecycle rule (see README), not per object: every object
 * written here (sources and per-step renders) is disposable.
 */
export class ImageStorageService {
  private bucket() {
    return getStorage(getOrInitApp()).bucket(env.puzzleImagesBucket);
  }

  async upload(path: string, data: Buffer, contentType: string): Promise<void> {
    await this.bucket().file(path).save(data, { contentType, resumable: false });
  }

  async download(path: string): Promise<Buffer> {
    const [data] = await this.bucket().file(path).download();
    return data;
  }

  async getSignedUrl(path: string): Promise<string> {
    const [url] = await this.bucket()
      .file(path)
      .getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_EXPIRY_MS });
    return url;
  }
}
