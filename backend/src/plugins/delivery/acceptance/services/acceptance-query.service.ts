import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { S3StorageService } from '@shared/services/s3-storage.service';

import { AcceptanceAccess } from '@plugins/delivery/acceptance/services/acceptance-access.service';
import {
  ACCEPTANCE_SELECT,
  FILE_SELECT,
  toAcceptanceView,
  type AcceptanceView,
  type RawRow,
} from '@plugins/delivery/acceptance/services/acceptance-views';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Readable } from 'stream';

export interface AcceptanceFileContent {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
  fileName: string;
}

/** Reads of acceptance minutes; the actor's scope is a condition in SQL on the order id. */
@Injectable()
export class AcceptanceQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: AcceptanceAccess,
    private readonly storage: S3StorageService,
  ) {}

  /** The minutes of a visible order, or null while it has none; 404 for an order out of scope. */
  async get(
    orderId: number,
    actor: AuthUserPayload,
  ): Promise<AcceptanceView | null> {
    const manager = this.dataSource.manager;
    await this.access.assertOrderVisible(manager, actor, orderId);
    const [row]: RawRow[] = await manager.query(
      `${ACCEPTANCE_SELECT} WHERE a.order_id = $1 AND a.is_deleted = false`,
      [orderId],
    );
    if (!row) return null;
    const files: RawRow[] = await manager.query(
      `${FILE_SELECT} WHERE f.acceptance_id = $1 AND f.is_deleted = false ORDER BY f.id`,
      [row.id],
    );
    return toAcceptanceView(row, files);
  }

  /** A file of an acceptance in the actor's scope; the scope condition is in the SQL. */
  async content(
    fileId: number,
    actor: AuthUserPayload,
  ): Promise<AcceptanceFileContent> {
    const reach = this.access.orderScope(actor)('a.order_id');
    const [row]: RawRow[] = await this.dataSource.query(
      `SELECT f.storage_key, f.content_type, f.size_bytes, f.file_name
         FROM acceptance_files f
         JOIN acceptances a ON a.id = f.acceptance_id
        WHERE f.id = $${reach.params.length + 1} AND f.is_deleted = false
          AND a.is_deleted = false AND (${reach.sql})`,
      [...reach.params, fileId],
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
}
