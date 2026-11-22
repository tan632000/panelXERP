import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { S3StorageService } from '@shared/services/s3-storage.service';

import {
  checkDocument,
  MAX_FILES_PER_RECEIPT,
  objectKey,
  type CheckedDeliveryFile,
  type UploadedDeliveryFile,
} from '@plugins/delivery/_shared/utils/delivery-file.util';
import { ReceiveDeliveryNoteDto } from '@plugins/delivery/delivery-note/dto/delivery-note.dto';
import {
  DeliveryNoteAccess,
  NOTE_NOT_FOUND,
} from '@plugins/delivery/delivery-note/services/delivery-note-access.service';
import { DeliveryNoteQueryService } from '@plugins/delivery/delivery-note/services/delivery-note-query.service';
import {
  DeliveryNoteService,
  type StoredHandoverFile,
} from '@plugins/delivery/delivery-note/services/delivery-note.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { DeliveryNoteDetail } from '@plugins/delivery/delivery-note/services/delivery-note-views';
import type { Readable } from 'stream';

export interface DeliveryNoteFileContent {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
  fileName: string;
}

/**
 * The handover files of a receipt. A receipt checks the files and the actor's visibility of the
 * note first, so nothing is stored for a note the actor cannot see; it then stores the objects,
 * writes the rows in the receive transaction (which checks scope and status again on locked
 * state) and deletes every object again when that fails.
 */
@Injectable()
export class DeliveryNoteFileService {
  private readonly logger = new Logger(DeliveryNoteFileService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DeliveryNoteAccess,
    private readonly notes: DeliveryNoteService,
    private readonly queries: DeliveryNoteQueryService,
    private readonly storage: S3StorageService,
  ) {}

  async receive(
    noteId: number,
    dto: ReceiveDeliveryNoteDto,
    files: readonly UploadedDeliveryFile[] | undefined,
    actor: AuthUserPayload,
  ): Promise<DeliveryNoteDetail> {
    if (!files || files.length < 1 || files.length > MAX_FILES_PER_RECEIPT) {
      throw new BadRequestException(
        `A receipt needs 1 to ${MAX_FILES_PER_RECEIPT} handover files.`,
      );
    }
    const checked: CheckedDeliveryFile[] = [];
    for (const file of files) checked.push(await checkDocument(file));

    const orderId = await this.access.orderOfNote(
      this.dataSource.manager,
      noteId,
    );
    await this.access.assertOrderVisible(
      this.dataSource.manager,
      actor,
      orderId,
      NOTE_NOT_FOUND,
    );

    const keys: string[] = [];
    try {
      const stored: StoredHandoverFile[] = [];
      for (const file of checked) {
        const key = objectKey('handover', noteId, file.extension);
        // Listed before the upload: a failed upload may still have left its object behind.
        keys.push(key);
        await this.storage.upload(key, file.buffer, file.contentType);
        stored.push({
          key,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.buffer.length,
        });
      }
      await this.notes.receive(noteId, dto, stored, actor);
    } catch (error: unknown) {
      // The objects were stored before the rows; without rows nothing would ever reach them.
      await Promise.all(keys.map((key) => this.discardObject(key)));
      throw error;
    }
    return this.queries.getNote(noteId, actor);
  }

  /** The file of a note: both ids must match and the note must be in the actor's scope. */
  async content(
    noteId: number,
    fileId: number,
    actor: AuthUserPayload,
  ): Promise<DeliveryNoteFileContent> {
    const reach = this.access.orderScope(actor)('n.order_id');
    const first = reach.params.length;
    const [row]: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT f.storage_key, f.content_type, f.size_bytes, f.file_name
         FROM delivery_note_files f
         JOIN delivery_notes n ON n.id = f.note_id
        WHERE f.id = $${first + 1} AND f.note_id = $${first + 2}
          AND f.is_deleted = false AND n.is_deleted = false AND (${reach.sql})`,
      [...reach.params, fileId, noteId],
    );
    if (!row) throw new NotFoundException('File not found');
    try {
      return {
        stream: await this.storage.getObjectStream(String(row.storage_key)),
        contentType: String(row.content_type),
        sizeBytes: Number(row.size_bytes),
        fileName: String(row.file_name),
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NoSuchKey') {
        throw new NotFoundException('The file is no longer available.');
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
