import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { S3StorageService } from '@shared/services/s3-storage.service';

import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { REQUEST_ATTACHMENT_OPEN_STATUSES } from '@plugins/sales/request/constants/request-status-transitions.constant';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_REQUEST,
} from '@plugins/sales/request/constants/request.constant';
import { SalesRequestAttachment } from '@plugins/sales/request/entities/request-attachment.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import { RequestService } from '@plugins/sales/request/services/request.service';
import { sanitizeAttachmentName } from '@plugins/sales/request/utils/attachment-filename.util';
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_TYPES,
  extensionOf,
} from '@plugins/sales/request/utils/attachment-type.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Readable } from 'stream';

/** An attachment as the API lists it. The storage key stays server-side. */
export interface RequestAttachmentView {
  id: number;
  requestId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: number | null;
  createdAt: Date;
}

export interface RequestAttachmentDownload {
  stream: Readable;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** The part of a multer file the upload reads. */
export type UploadedAttachment = Pick<
  Express.Multer.File,
  'originalname' | 'buffer' | 'size'
>;

const attachmentLimitMessage = () =>
  `A request holds at most ${MAX_ATTACHMENTS_PER_REQUEST} files.`;

function toView(row: SalesRequestAttachment): RequestAttachmentView {
  return {
    id: row.id,
    requestId: row.requestId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * Drawings and specs of a request. Every entry point first reads the request through the
 * actor's data scope, so a file is reachable exactly by the people who can see its request
 * and a request outside the scope answers 404 for its files too.
 */
@Injectable()
export class RequestAttachmentService {
  private readonly logger = new Logger(RequestAttachmentService.name);

  constructor(
    @InjectRepository(SalesRequestAttachment)
    private readonly attachmentRepo: Repository<SalesRequestAttachment>,
    private readonly dataSource: DataSource,
    private readonly requests: RequestService,
    private readonly storage: S3StorageService,
  ) {}

  async list(
    requestId: number,
    actor: AuthUserPayload,
  ): Promise<RequestAttachmentView[]> {
    await this.requests.findVisible(requestId, actor);
    const rows = await this.attachmentRepo.find({
      where: { requestId },
      order: { id: 'ASC' },
    });
    return rows.map(toView);
  }

  async upload(
    requestId: number,
    file: UploadedAttachment | undefined,
    actor: AuthUserPayload,
  ): Promise<RequestAttachmentView> {
    const request = await this.requests.findVisible(requestId, actor);
    // Refuse before storing anything; the locked re-check below still settles a race.
    this.assertOpenForFiles(request.status);
    if (
      (await this.attachmentRepo.count({ where: { requestId } })) >=
      MAX_ATTACHMENTS_PER_REQUEST
    ) {
      throw new BadRequestException(attachmentLimitMessage());
    }
    const checked = await this.validate(file);

    const key = `sales-requests/${requestId}/${randomUUID()}.${checked.extension}`;
    await this.storage.upload(key, checked.buffer, checked.contentType);

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        // The lock serialises concurrent uploads, so the count below cannot be raced past.
        const request = await this.requests.lockVisible(
          manager,
          requestId,
          actor,
        );
        this.assertOpenForFiles(request.status);

        const repo = manager.getRepository(SalesRequestAttachment);
        const count = await repo.count({ where: { requestId } });
        if (count >= MAX_ATTACHMENTS_PER_REQUEST) {
          throw new BadRequestException(attachmentLimitMessage());
        }

        const row = await repo.save(
          repo.create({
            requestId,
            storageKey: key,
            fileName: checked.fileName,
            contentType: checked.contentType,
            sizeBytes: checked.buffer.length,
            uploadedBy: actor.userId,
          }),
        );
        await recordRequestActivity(manager, {
          requestId,
          action: 'attachment_added',
          actorId: actor.userId,
          note: checked.fileName,
        });
        return row;
      });
      return toView(saved);
    } catch (error: unknown) {
      // The object was stored before the row; without a row nothing would ever reach it.
      await this.discardObject(key);
      throw error;
    }
  }

  async download(
    requestId: number,
    attachmentId: number,
    actor: AuthUserPayload,
  ): Promise<RequestAttachmentDownload> {
    await this.requests.findVisible(requestId, actor);
    const row = await this.findOwned(requestId, attachmentId);

    try {
      return {
        stream: await this.storage.getObjectStream(row.storageKey),
        fileName: row.fileName,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NoSuchKey') {
        throw new NotFoundException('The file is no longer available.');
      }
      throw error;
    }
  }

  async remove(
    requestId: number,
    attachmentId: number,
    actor: AuthUserPayload,
  ): Promise<{ id: number }> {
    const removed = await this.dataSource.transaction(async (manager) => {
      const request = await this.requests.lockVisible(
        manager,
        requestId,
        actor,
      );
      if (!REQUEST_ATTACHMENT_OPEN_STATUSES.includes(request.status)) {
        throw new ConflictException(
          `Files can no longer be removed from a request that is ${request.status}.`,
        );
      }

      const repo = manager.getRepository(SalesRequestAttachment);
      const row = await repo.findOne({
        where: { id: attachmentId, requestId },
      });
      if (!row) throw new NotFoundException('Attachment not found');

      await repo.delete({ id: row.id });
      await recordRequestActivity(manager, {
        requestId,
        action: 'attachment_removed',
        actorId: actor.userId,
        note: row.fileName,
      });
      return row;
    });

    await this.discardObject(removed.storageKey);
    return { id: removed.id };
  }

  private async findOwned(
    requestId: number,
    attachmentId: number,
  ): Promise<SalesRequestAttachment> {
    const row = await this.attachmentRepo.findOne({
      where: { id: attachmentId, requestId },
    });
    if (!row) throw new NotFoundException('Attachment not found');
    return row;
  }

  /**
   * The upload as it will be stored, or a 4xx. The extension must be allowed and the bytes
   * must be that format's; the content type and the stored name come from here, not from
   * what the client declared.
   */
  private async validate(file: UploadedAttachment | undefined) {
    if (!file?.buffer) throw new BadRequestException('File is required.');
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException(
        `A file may be at most ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`,
      );
    }

    const fileName = sanitizeAttachmentName(file.originalname);
    const extension = extensionOf(fileName);
    const type =
      extension && Object.hasOwn(ATTACHMENT_TYPES, extension)
        ? ATTACHMENT_TYPES[extension]
        : undefined;
    if (!extension || !type) {
      throw new BadRequestException(
        `File type is not allowed. Allowed types: ${ATTACHMENT_EXTENSIONS.join(', ')}.`,
      );
    }
    if (!(await type.matches(file.buffer))) {
      throw new BadRequestException(
        `File content is not a valid .${extension} file.`,
      );
    }

    return {
      buffer: file.buffer,
      fileName,
      extension,
      contentType: type.contentType,
    };
  }

  private assertOpenForFiles(status: RequestStatus): void {
    if (!REQUEST_ATTACHMENT_OPEN_STATUSES.includes(status)) {
      throw new ConflictException(
        `Files can no longer be added to a request that is ${status}.`,
      );
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
