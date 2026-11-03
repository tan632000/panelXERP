import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';
import { S3StorageService } from '@shared/services/s3-storage.service';

import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import { lockUnitForWork } from '@plugins/production/production-order/utils/production-order-lock.util';
import { mayWorkUnit } from '@plugins/production/production-order/utils/production-scope.util';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_UNIT,
} from '@plugins/production/progress/constants/photo.constant';
import { UnitPhoto } from '@plugins/production/progress/entities/unit-photo.entity';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import {
  hasImageSignature,
  IMAGE_EXTENSIONS,
  imageTypeOfName,
} from '@plugins/production/progress/utils/image-type.util';
import { sanitizePhotoName } from '@plugins/production/progress/utils/photo-filename.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';
import type { UploadPhotoDto } from '@plugins/production/progress/dto/progress.dto';
import type { Readable } from 'stream';

/** A photo as the API lists it. The storage key stays server-side. */
export interface UnitPhotoView {
  id: number;
  unitId: number;
  stage: ProductionStage;
  issueId: number | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: number | null;
  uploadedByName: string | null;
  createdAt: Date;
}

export interface UnitPhotoContent {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
}

/** The part of a multer file the upload reads. */
export type UploadedPhoto = Pick<
  Express.Multer.File,
  'originalname' | 'buffer' | 'size'
>;

const WORKING = [ProductionOrderStatus.RELEASED];
const limitMessage = () =>
  `A cabinet holds at most ${MAX_PHOTOS_PER_UNIT} photos.`;

type PhotoRow = Record<string, unknown>;

const PHOTO_SELECT = `SELECT photo.id, photo.unit_id, photo.stage, photo.issue_id, photo.file_name,
       photo.content_type, photo.size_bytes, photo.uploaded_by, photo.created_at,
       uploader.full_name AS uploaded_by_name
  FROM production_unit_photos photo
  LEFT JOIN users uploader ON uploader.id = photo.uploaded_by`;

function toView(row: PhotoRow): UnitPhotoView {
  return {
    id: Number(row.id),
    unitId: Number(row.unit_id),
    stage: row.stage as ProductionStage,
    issueId: row.issue_id === null ? null : Number(row.issue_id),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    uploadedBy: row.uploaded_by === null ? null : Number(row.uploaded_by),
    uploadedByName:
      typeof row.uploaded_by_name === 'string' ? row.uploaded_by_name : null,
    createdAt: row.created_at as Date,
  };
}

/**
 * Photos of a cabinet, per stage. Reads go through the cabinet's data scope, so a photo is
 * reachable exactly by those who can read its cabinet. An upload stores the object first and
 * the row under the production order locks, where the cabinet's state and the photo count are
 * checked on locked rows; an upload that fails there deletes the object again.
 */
@Injectable()
export class UnitPhotoService {
  private readonly logger = new Logger(UnitPhotoService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly queries: ProgressQueryService,
    private readonly storage: S3StorageService,
  ) {}

  async list(unitId: number, actor: AuthUserPayload): Promise<UnitPhotoView[]> {
    await this.queries.findOne(unitId, actor);
    const rows: PhotoRow[] = await this.dataSource.query(
      `${PHOTO_SELECT} WHERE photo.unit_id = $1 ORDER BY photo.id`,
      [unitId],
    );
    return rows.map(toView);
  }

  async upload(
    unitId: number,
    file: UploadedPhoto | undefined,
    dto: UploadPhotoDto,
    actor: AuthUserPayload,
  ): Promise<UnitPhotoView> {
    const checked = this.validate(file);
    // Refuse a cabinet the actor cannot read before storing anything.
    await this.queries.findOne(unitId, actor);

    const key = `production/${unitId}/${randomUUID()}.${checked.extension}`;
    await this.storage.upload(key, checked.buffer, checked.contentType);

    const scope = this.dataScope.scopeOf(actor);
    let id: number;
    try {
      id = await this.dataSource.transaction(async (manager) => {
        const { unit } = await lockUnitForWork(
          manager,
          unitId,
          (candidate) => mayWorkUnit(scope, candidate, actor),
          WORKING,
          'photographed',
        );
        if (dto.issueId !== undefined) {
          const issues: unknown[] = await manager.query(
            `SELECT 1 FROM production_issues
              WHERE id = $1 AND unit_id = $2 AND is_deleted = false`,
            [dto.issueId, unit.id],
          );
          if (issues.length === 0) {
            throw new BadRequestException(
              'The issue does not belong to this cabinet.',
            );
          }
        }

        const repo = manager.getRepository(UnitPhoto);
        // The locks serialise concurrent uploads, so this count cannot be raced past.
        if ((await repo.count({ where: { unitId } })) >= MAX_PHOTOS_PER_UNIT) {
          throw new BadRequestException(limitMessage());
        }
        const row = await repo.save(
          repo.create({
            unitId,
            stage: dto.stage,
            issueId: dto.issueId ?? null,
            storageKey: key,
            fileName: checked.fileName,
            contentType: checked.contentType,
            sizeBytes: checked.buffer.length,
            uploadedBy: actor.userId,
          }),
        );
        return row.id;
      });
    } catch (error: unknown) {
      // The object was stored before the row; without a row nothing would ever reach it.
      await this.discardObject(key);
      throw error;
    }
    return this.findView(id);
  }

  async content(
    photoId: number,
    actor: AuthUserPayload,
  ): Promise<UnitPhotoContent> {
    const row = await this.dataSource
      .getRepository(UnitPhoto)
      .findOne({ where: { id: photoId } });
    if (!row) throw new NotFoundException('Photo not found');
    await this.queries.findOne(row.unitId, actor);

    try {
      return {
        stream: await this.storage.getObjectStream(row.storageKey),
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NoSuchKey') {
        throw new NotFoundException('The photo is no longer available.');
      }
      throw error;
    }
  }

  private async findView(id: number): Promise<UnitPhotoView> {
    const rows: PhotoRow[] = await this.dataSource.query(
      `${PHOTO_SELECT} WHERE photo.id = $1`,
      [id],
    );
    return toView(rows[0]);
  }

  /**
   * The upload as it will be stored, or a 4xx. The extension must be png/jpg/jpeg and the
   * bytes must be that format's; the content type and the stored extension come from here,
   * not from what the client declared.
   */
  private validate(file: UploadedPhoto | undefined) {
    if (!file?.buffer) throw new BadRequestException('File is required.');
    if (file.buffer.length > MAX_PHOTO_BYTES) {
      throw new PayloadTooLargeException(
        `A photo may be at most ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`,
      );
    }
    const fileName = sanitizePhotoName(file.originalname);
    const type = imageTypeOfName(fileName);
    if (!type) {
      throw new BadRequestException(
        `File type is not allowed. Allowed types: ${IMAGE_EXTENSIONS.join(', ')}.`,
      );
    }
    if (!hasImageSignature(type, file.buffer)) {
      throw new BadRequestException(
        `File content is not a valid ${type.contentType} image.`,
      );
    }
    return {
      buffer: file.buffer,
      fileName,
      extension: type.extension,
      contentType: type.contentType,
    };
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
