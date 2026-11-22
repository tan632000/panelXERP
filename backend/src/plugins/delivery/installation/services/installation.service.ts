import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { InstallationStatus } from '@plugins/delivery/installation/constants/installation.constant';
import {
  CreateInstallationDto,
  UpdateInstallationDto,
} from '@plugins/delivery/installation/dto/installation.dto';
import {
  InstallationAccess,
  ORDER_NOT_FOUND,
} from '@plugins/delivery/installation/services/installation-access.service';
import { InstallationQueryService } from '@plugins/delivery/installation/services/installation-query.service';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { InstallationDetail } from '@plugins/delivery/installation/services/installation-views';

/**
 * Writes of installations. Every one takes the order row first (global lock order: order →
 * production order → cabinets → delivery rows → stock), checks the actor's scope on it (404
 * before any status answer), re-checks that the order is `in_production` or `delivered` (409),
 * and only then reads the installation `FOR UPDATE`, so what it decides on cannot move under it.
 */
@Injectable()
export class InstallationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: InstallationAccess,
    private readonly orders: OrderProductionPort,
    private readonly queries: InstallationQueryService,
  ) {}

  async create(
    orderId: number,
    dto: CreateInstallationDto,
    actor: AuthUserPayload,
  ): Promise<InstallationDetail> {
    const id = await this.dataSource.transaction(async (manager) => {
      const order = await this.orders.lockForProduction(manager, orderId);
      if (!order) throw new NotFoundException(ORDER_NOT_FOUND);
      await this.access.assertOrderVisible(
        manager,
        actor,
        orderId,
        ORDER_NOT_FOUND,
      );
      this.access.assertOrderWritable(order);
      const existing: unknown[] = await manager.query(
        `SELECT 1 FROM installations WHERE order_id = $1 AND is_deleted = false`,
        [orderId],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Order ${order.code} already has an installation.`,
        );
      }
      const [row]: Array<{ id: number }> = await manager.query(
        `INSERT INTO installations
           (order_id, site_address, planned_date, person_in_charge, note, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
        [
          orderId,
          dto.siteAddress || (await this.orders.siteAddress(manager, orderId)),
          dto.plannedDate ?? null,
          dto.personInCharge || null,
          dto.note || null,
          InstallationStatus.PLANNED,
          actor.userId,
        ],
      );
      return row.id;
    });
    return this.queries.get(id, actor);
  }

  /** Edits the given fields while the installation is not done; an empty text clears one. */
  async update(
    id: number,
    dto: UpdateInstallationDto,
    actor: AuthUserPayload,
  ): Promise<InstallationDetail> {
    const columns: Array<[string, string | undefined]> = [
      ['site_address', dto.siteAddress],
      ['planned_date', dto.plannedDate],
      ['person_in_charge', dto.personInCharge],
      ['note', dto.note],
    ];
    await this.write(id, actor, async (manager, installation) => {
      this.assertStatus(
        installation.status,
        [InstallationStatus.PLANNED, InstallationStatus.IN_PROGRESS],
        'edited',
      );
      const params: unknown[] = [id, actor.userId];
      const sets = ['updated_by = $2', 'updated_at = NOW()'];
      for (const [column, value] of columns) {
        if (value === undefined) continue;
        params.push(value === '' ? null : value);
        sets.push(`${column} = $${params.length}`);
      }
      await manager.query(
        `UPDATE installations SET ${sets.join(', ')} WHERE id = $1`,
        params,
      );
    });
    return this.queries.get(id, actor);
  }

  start(id: number, actor: AuthUserPayload): Promise<InstallationDetail> {
    return this.move(
      id,
      actor,
      InstallationStatus.PLANNED,
      InstallationStatus.IN_PROGRESS,
      'started_at',
      'started_by',
    );
  }

  finish(id: number, actor: AuthUserPayload): Promise<InstallationDetail> {
    return this.move(
      id,
      actor,
      InstallationStatus.IN_PROGRESS,
      InstallationStatus.DONE,
      'done_at',
      'done_by',
    );
  }

  private async move(
    id: number,
    actor: AuthUserPayload,
    from: InstallationStatus,
    to: InstallationStatus,
    atColumn: 'started_at' | 'done_at',
    byColumn: 'started_by' | 'done_by',
  ): Promise<InstallationDetail> {
    await this.write(id, actor, async (manager, installation) => {
      this.assertStatus(installation.status, [from], to);
      await manager.query(
        `UPDATE installations
            SET status = $2, ${atColumn} = NOW(), ${byColumn} = $3, updated_by = $3, updated_at = NOW()
          WHERE id = $1`,
        [id, to, actor.userId],
      );
    });
    return this.queries.get(id, actor);
  }

  /** A write of one installation under its locks; `change` decides on the locked state. */
  private async write(
    id: number,
    actor: AuthUserPayload,
    change: (
      manager: EntityManager,
      installation: { status: InstallationStatus },
    ) => Promise<void>,
  ): Promise<void> {
    const orderId = await this.access.orderOfInstallation(
      this.dataSource.manager,
      id,
    );
    await this.dataSource.transaction(async (manager) =>
      change(
        manager,
        await this.access.lockForWrite(manager, actor, id, orderId),
      ),
    );
  }

  private assertStatus(
    current: InstallationStatus,
    allowed: readonly InstallationStatus[],
    target: string,
  ): void {
    if (!allowed.includes(current)) {
      throw new ConflictException(
        `The installation is ${current} and cannot be ${target}.`,
      );
    }
  }
}
