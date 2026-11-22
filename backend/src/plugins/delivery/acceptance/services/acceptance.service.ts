import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { S3StorageService } from '@shared/services/s3-storage.service';

import {
  checkDocument,
  MAX_FILES_PER_ACCEPTANCE,
  objectKey,
  type CheckedDeliveryFile,
  type UploadedDeliveryFile,
} from '@plugins/delivery/_shared/utils/delivery-file.util';
import { CreateAcceptanceDto } from '@plugins/delivery/acceptance/dto/acceptance.dto';
import {
  AcceptanceAccess,
  ORDER_NOT_FOUND,
} from '@plugins/delivery/acceptance/services/acceptance-access.service';
import { AcceptanceQueryService } from '@plugins/delivery/acceptance/services/acceptance-query.service';
import { DeliveryNoteStatus } from '@plugins/delivery/delivery-note/constants/delivery-note.constant';
import { InstallationStatus } from '@plugins/delivery/installation/constants/installation.constant';
import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';
import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { AcceptanceView } from '@plugins/delivery/acceptance/services/acceptance-views';

/**
 * The acceptance minutes of an order. A create checks the files and the actor's visibility of
 * the order first, so nothing is stored for an order the actor cannot see; it then stores the
 * objects and writes the rows in one transaction with the order's move `delivered → completed`.
 * That transaction takes the order row first (global lock order: order → production → delivery
 * rows → stock) and decides on locked state in this order: scope (404), order status (409),
 * installation (409), existing minutes (409), dates (400). It deletes every object again when it
 * fails. Followers are told after the commit.
 */
@Injectable()
export class AcceptanceService {
  private readonly logger = new Logger(AcceptanceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: AcceptanceAccess,
    private readonly orders: OrderProductionPort,
    private readonly followers: OrderFollowerNotifier,
    private readonly queries: AcceptanceQueryService,
    private readonly storage: S3StorageService,
  ) {}

  async create(
    orderId: number,
    dto: CreateAcceptanceDto,
    files: readonly UploadedDeliveryFile[] | undefined,
    actor: AuthUserPayload,
  ): Promise<AcceptanceView> {
    if (!files || files.length < 1 || files.length > MAX_FILES_PER_ACCEPTANCE) {
      throw new BadRequestException(
        `The acceptance minutes need 1 to ${MAX_FILES_PER_ACCEPTANCE} files.`,
      );
    }
    const checked: CheckedDeliveryFile[] = [];
    for (const file of files) checked.push(await checkDocument(file));
    await this.access.assertOrderVisible(
      this.dataSource.manager,
      actor,
      orderId,
    );

    const keys: string[] = [];
    try {
      const stored: Array<{ key: string; file: CheckedDeliveryFile }> = [];
      for (const file of checked) {
        const key = objectKey('acceptance', orderId, file.extension);
        // Listed before the upload: a failed upload may still have left its object behind.
        keys.push(key);
        await this.storage.upload(key, file.buffer, file.contentType);
        stored.push({ key, file });
      }
      await this.write(orderId, dto, stored, actor);
    } catch (error: unknown) {
      // The objects were stored before the rows; without rows nothing would ever reach them.
      await Promise.all(keys.map((key) => this.discardObject(key)));
      throw error;
    }
    await this.followers.notify(orderId, 'completed', actor.userId);
    const created = await this.queries.get(orderId, actor);
    if (!created) throw new NotFoundException(ORDER_NOT_FOUND);
    return created;
  }

  private async write(
    orderId: number,
    dto: CreateAcceptanceDto,
    stored: ReadonlyArray<{ key: string; file: CheckedDeliveryFile }>,
    actor: AuthUserPayload,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.orders.lockForProduction(manager, orderId);
      if (!order) throw new NotFoundException(ORDER_NOT_FOUND);
      await this.access.assertOrderVisible(manager, actor, orderId);
      if ((order.status as OrderStatus) !== OrderStatus.DELIVERED) {
        throw new ConflictException(
          `Order ${order.code} is ${order.status}; only a delivered order can be accepted.`,
        );
      }
      const [installation]: Array<{ status: InstallationStatus }> =
        await manager.query(
          `SELECT status FROM installations WHERE order_id = $1 AND is_deleted = false`,
          [orderId],
        );
      if (installation && installation.status !== InstallationStatus.DONE) {
        throw new ConflictException(
          `The installation of order ${order.code} is ${installation.status}; it must be done first.`,
        );
      }
      const existing: unknown[] = await manager.query(
        `SELECT 1 FROM acceptances WHERE order_id = $1 AND is_deleted = false`,
        [orderId],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Order ${order.code} already has acceptance minutes.`,
        );
      }
      if (dto.signedDate > vnToday()) {
        throw new BadRequestException(
          'The signed date cannot be in the future.',
        );
      }
      const [{ latest }]: Array<{ latest: string | null }> =
        await manager.query(
          `SELECT MAX(received_date)::text AS latest FROM delivery_notes
            WHERE order_id = $1 AND status = $2 AND is_deleted = false`,
          [orderId, DeliveryNoteStatus.RECEIVED],
        );
      if (latest && dto.signedDate < latest) {
        throw new BadRequestException(
          `The signed date cannot be before the last receipt (${latest}).`,
        );
      }
      const [row]: Array<{ id: number }> = await manager.query(
        `INSERT INTO acceptances (order_id, representative_name, signed_date, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [orderId, dto.representativeName, dto.signedDate, actor.userId],
      );
      await manager.query(
        `INSERT INTO acceptance_files
           (acceptance_id, storage_key, content_type, file_name, size_bytes, created_by, updated_by)
         SELECT $1, t.storage_key, t.content_type, t.file_name, t.size_bytes, $2, $2
           FROM unnest($3::text[], $4::text[], $5::text[], $6::int[])
                AS t(storage_key, content_type, file_name, size_bytes)`,
        [
          row.id,
          actor.userId,
          stored.map(({ key }) => key),
          stored.map(({ file }) => file.contentType),
          stored.map(({ file }) => file.fileName),
          stored.map(({ file }) => file.buffer.length),
        ],
      );
      await this.orders.moveStatus(
        manager,
        orderId,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
      );
    });
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
