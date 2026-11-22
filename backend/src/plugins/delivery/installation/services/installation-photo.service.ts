import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { S3StorageService } from '@shared/services/s3-storage.service';

import {
  checkPhoto,
  MAX_PHOTOS_PER_INSTALLATION,
  objectKey,
  type UploadedDeliveryFile,
} from '@plugins/delivery/_shared/utils/delivery-file.util';
import { InstallationAccess } from '@plugins/delivery/installation/services/installation-access.service';
import {
  PHOTO_SELECT,
  toPhotoView,
  type InstallationPhotoView,
  type RawRow,
} from '@plugins/delivery/installation/services/installation-views';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Readable } from 'stream';

export interface InstallationPhotoContent {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
}

/**
 * Photos of an installation. An upload checks the file and the actor's visibility first, so
 * nothing is stored for an installation the actor cannot see; it then stores the object and
 * writes the row under the order and installation locks, where scope, order status and the
 * per-installation count are checked again on locked state. An upload that fails there deletes
 * the object again.
 */
@Injectable()
export class InstallationPhotoService {
  private readonly logger = new Logger(InstallationPhotoService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: InstallationAccess,
    private readonly storage: S3StorageService,
  ) {}

  async upload(
    installationId: number,
    file: UploadedDeliveryFile | undefined,
    actor: AuthUserPayload,
  ): Promise<InstallationPhotoView> {
    const checked = checkPhoto(file);
    const orderId = await this.access.orderOfInstallation(
      this.dataSource.manager,
      installationId,
    );
    await this.access.assertOrderVisible(
      this.dataSource.manager,
      actor,
      orderId,
      'Installation not found',
    );

    const key = objectKey(
      'installation-photo',
      installationId,
      checked.extension,
    );
    // A failed upload may still have left its object behind, so the catch removes it too.
    let id: number;
    try {
      await this.storage.upload(key, checked.buffer, checked.contentType);
      id = await this.dataSource.transaction(async (manager) => {
        await this.access.lockForWrite(manager, actor, installationId, orderId);
        // The locks serialise concurrent uploads, so this count cannot be raced past.
        const [{ total }]: Array<{ total: string }> = await manager.query(
          `SELECT COUNT(*) AS total FROM installation_photos
            WHERE installation_id = $1 AND is_deleted = false`,
          [installationId],
        );
        if (Number(total) >= MAX_PHOTOS_PER_INSTALLATION) {
          throw new BadRequestException(
            `An installation holds at most ${MAX_PHOTOS_PER_INSTALLATION} photos.`,
          );
        }
        const [row]: Array<{ id: number }> = await manager.query(
          `INSERT INTO installation_photos
             (installation_id, storage_key, content_type, file_name, size_bytes, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
          [
            installationId,
            key,
            checked.contentType,
            checked.fileName,
            checked.buffer.length,
            actor.userId,
          ],
        );
        return row.id;
      });
    } catch (error: unknown) {
      // The object was stored before the row; without a row nothing would ever reach it.
      await this.discardObject(key);
      throw error;
    }
    const [row]: RawRow[] = await this.dataSource.query(
      `${PHOTO_SELECT} WHERE p.id = $1`,
      [id],
    );
    return toPhotoView(row);
  }

  /** The photo of an installation in the actor's scope; the scope condition is in the SQL. */
  async content(
    photoId: number,
    actor: AuthUserPayload,
  ): Promise<InstallationPhotoContent> {
    const reach = this.access.orderScope(actor)('i.order_id');
    const [row]: RawRow[] = await this.dataSource.query(
      `SELECT p.storage_key, p.content_type, p.size_bytes
         FROM installation_photos p
         JOIN installations i ON i.id = p.installation_id
        WHERE p.id = $${reach.params.length + 1} AND p.is_deleted = false
          AND i.is_deleted = false AND (${reach.sql})`,
      [...reach.params, photoId],
    );
    if (!row) throw new NotFoundException('Photo not found');
    try {
      return {
        stream: await this.storage.getObjectStream(String(row.storage_key)),
        contentType: String(row.content_type),
        sizeBytes: Number(row.size_bytes),
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NoSuchKey') {
        throw new NotFoundException('The photo is no longer available.');
      }
      throw error;
    }
  }

  /** Best effort: a leftover object is unreachable, so failing to remove it must not fail the call. */
  private async discardObject(key: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not remove stored object ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
