import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';
import { S3StorageService } from '@shared/services/s3-storage.service';

import {
  checkPhoto,
  MAX_PHOTOS_PER_QC_ROUND,
  objectKey,
  type UploadedDeliveryFile,
} from '@plugins/delivery/_shared/utils/delivery-file.util';
import {
  assertUnitVisible,
  deliveryOrderScope,
} from '@plugins/delivery/_shared/utils/delivery-scope.util';
import { QcPhoto } from '@plugins/delivery/qc-inspection/entities/qc-photo.entity';
import {
  PHOTO_SELECT,
  toPhotoView,
  type QcPhotoView,
  type RawRow,
} from '@plugins/delivery/qc-inspection/services/qc-views';
import { ProductionUnitPort } from '@plugins/production/_shared/ports/production-unit.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Readable } from 'stream';

export interface QcPhotoContent {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
}

/**
 * Photos of QC round items. Reads and uploads go through the cabinet's order scope, so a photo is
 * reachable exactly by those who can read its cabinet. An upload checks the file and the
 * visibility first, stores the object, then writes the row under the production locks, where the
 * scope and the per-round count are checked again on locked state; an upload that fails there
 * deletes the object again.
 */
@Injectable()
export class QcPhotoService {
  private readonly logger = new Logger(QcPhotoService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly units: ProductionUnitPort,
    private readonly production: OrderProductionPort,
    private readonly storage: S3StorageService,
  ) {}

  async upload(
    roundItemId: number,
    file: UploadedDeliveryFile | undefined,
    actor: AuthUserPayload,
  ): Promise<QcPhotoView> {
    const checked = checkPhoto(file);
    // Refuse an item the actor cannot see before storing anything.
    const { unitId, roundId } = await this.locate(roundItemId);
    await assertUnitVisible(
      this.dataSource.manager,
      this.units,
      this.orderScope(actor),
      unitId,
    );

    const key = objectKey('qc-photo', roundItemId, checked.extension);
    await this.storage.upload(key, checked.buffer, checked.contentType);

    let id: number;
    try {
      id = await this.dataSource.transaction(async (manager) => {
        await this.units.lockUnit(manager, unitId);
        await assertUnitVisible(
          manager,
          this.units,
          this.orderScope(actor),
          unitId,
        );
        // The locks serialise concurrent uploads, so this count cannot be raced past.
        const [{ total }]: Array<{ total: string }> = await manager.query(
          `SELECT COUNT(*) AS total
             FROM qc_photos p JOIN qc_round_items it ON it.id = p.round_item_id
            WHERE it.round_id = $1 AND p.is_deleted = false`,
          [roundId],
        );
        if (Number(total) >= MAX_PHOTOS_PER_QC_ROUND) {
          throw new BadRequestException(
            `A QC round holds at most ${MAX_PHOTOS_PER_QC_ROUND} photos.`,
          );
        }
        const repo = manager.getRepository(QcPhoto);
        const row = await repo.save(
          repo.create({
            roundItemId,
            storageKey: key,
            contentType: checked.contentType,
            fileName: checked.fileName,
            sizeBytes: checked.buffer.length,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          }),
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

  async content(
    photoId: number,
    actor: AuthUserPayload,
  ): Promise<QcPhotoContent> {
    const reach = this.orderScope(actor)('po.order_id');
    const [row]: RawRow[] = await this.dataSource.query(
      `SELECT p.storage_key, p.content_type, p.size_bytes
         FROM qc_photos p
         JOIN qc_round_items it ON it.id = p.round_item_id
         JOIN qc_rounds r ON r.id = it.round_id
         JOIN production_units u ON u.id = r.unit_id
         JOIN production_orders po ON po.id = u.production_order_id
        WHERE p.id = $${reach.params.length + 1} AND p.is_deleted = false
          AND it.is_deleted = false AND r.is_deleted = false
          AND u.is_deleted = false AND po.is_deleted = false
          AND (${reach.sql})`,
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

  private async locate(
    roundItemId: number,
  ): Promise<{ unitId: number; roundId: number }> {
    const [row]: RawRow[] = await this.dataSource.query(
      `SELECT r.id AS round_id, r.unit_id
         FROM qc_round_items it JOIN qc_rounds r ON r.id = it.round_id
        WHERE it.id = $1 AND it.is_deleted = false AND r.is_deleted = false`,
      [roundItemId],
    );
    if (!row) throw new NotFoundException('Round item not found');
    return { unitId: Number(row.unit_id), roundId: Number(row.round_id) };
  }

  private orderScope(actor: AuthUserPayload) {
    return deliveryOrderScope(
      this.dataScope.scopeOf(actor),
      actor,
      this.production,
    );
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
