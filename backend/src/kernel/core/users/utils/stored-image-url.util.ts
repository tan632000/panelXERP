import type { Logger } from '@nestjs/common';
import type { S3StorageService } from '@shared/services/s3-storage.service';

/** Long enough that a tab left open all day keeps showing the picture it loaded with. */
const STORED_IMAGE_URL_TTL_SECONDS = 12 * 3600;

/**
 * A browser-loadable link for an account image — avatar or signature. The column keeps the
 * storage key rather than a URL so the link can be re-signed on every read; a seeded or
 * externally hosted picture is already a URL and passes through.
 */
export async function resolveStoredImageUrl(
  s3: S3StorageService,
  key?: string | null,
): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return s3.getSignedUrl(key, STORED_IMAGE_URL_TTL_SECONDS);
}

/**
 * Deletes an account image the account no longer points at. The request that replaced it has
 * already succeeded, so a storage error here leaves an orphaned object but must not fail it.
 */
export async function discardStoredImage(
  s3: S3StorageService,
  logger: Pick<Logger, 'warn'>,
  key?: string | null,
): Promise<void> {
  if (!key || /^https?:\/\//.test(key)) return;
  try {
    await s3.deleteObject(key);
  } catch (error) {
    // Logged with its key so the object can still be swept by hand.
    logger.warn(
      `Could not delete replaced storage object ${key}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
