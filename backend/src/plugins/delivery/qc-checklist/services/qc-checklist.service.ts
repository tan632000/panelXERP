import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { QC_CHECKLIST_LOCK_KEY } from '@plugins/delivery/qc-checklist/constants/qc-checklist.constant';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type {
  CreateQcChecklistItemDto,
  UpdateQcChecklistItemDto,
} from '@plugins/delivery/qc-checklist/dto/qc-checklist.dto';

export interface QcChecklistItemView {
  id: number;
  name: string;
  position: number;
  active: boolean;
}

type RawRow = Record<string, unknown>;

const ITEM_COLUMNS = `id, name, position, active`;

const toView = (row: RawRow): QcChecklistItemView => ({
  id: Number(row.id),
  name: String(row.name),
  position: Number(row.position),
  active: Boolean(row.active),
});

/**
 * The checklist template every QC round copies. Reads take no lock. Every write takes the
 * exclusive template advisory lock first, then checks and writes on that serialised state, so
 * two adds never share a position and a rename never races the duplicate check.
 */
@Injectable()
export class QcChecklistService {
  constructor(private readonly dataSource: DataSource) {}

  async list(includeHidden: boolean): Promise<QcChecklistItemView[]> {
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT ${ITEM_COLUMNS} FROM qc_checklist_items
        WHERE is_deleted = false ${includeHidden ? '' : 'AND active = true'}
        ORDER BY position, id`,
    );
    return rows.map(toView);
  }

  add(
    dto: CreateQcChecklistItemDto,
    actor: AuthUserPayload,
  ): Promise<QcChecklistItemView> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockTemplate(manager);
      await this.assertNameFree(manager, dto.name);
      const [row]: RawRow[] = await manager.query(
        `INSERT INTO qc_checklist_items (name, position, created_by, updated_by)
         VALUES ($1,
                 (SELECT COALESCE(MAX(position), 0) + 1
                    FROM qc_checklist_items WHERE is_deleted = false),
                 $2, $2)
         RETURNING ${ITEM_COLUMNS}`,
        [dto.name, actor.userId],
      );
      return toView(row);
    });
  }

  update(
    id: number,
    dto: UpdateQcChecklistItemDto,
    actor: AuthUserPayload,
  ): Promise<QcChecklistItemView> {
    if (dto.name === undefined && dto.active === undefined) {
      throw new BadRequestException('Nothing to change.');
    }
    return this.dataSource.transaction(async (manager) => {
      await this.lockTemplate(manager);
      const current: RawRow[] = await manager.query(
        `SELECT id FROM qc_checklist_items WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (current.length === 0) {
        throw new NotFoundException('Checklist item not found.');
      }
      if (dto.name !== undefined) {
        await this.assertNameFree(manager, dto.name, id);
      }
      // TypeORM answers an UPDATE ... RETURNING with [rows, affectedCount].
      const [[row]]: [RawRow[], number] = await manager.query(
        `UPDATE qc_checklist_items
            SET name = COALESCE($2, name), active = COALESCE($3, active),
                updated_by = $4, updated_at = NOW()
          WHERE id = $1
          RETURNING ${ITEM_COLUMNS}`,
        [id, dto.name ?? null, dto.active ?? null, actor.userId],
      );
      return toView(row);
    });
  }

  /** `ids` must be exactly the set of every item, hidden ones included. */
  reorder(
    ids: number[],
    actor: AuthUserPayload,
  ): Promise<QcChecklistItemView[]> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockTemplate(manager);
      const existing: Array<{ id: number }> = await manager.query(
        `SELECT id FROM qc_checklist_items WHERE is_deleted = false`,
      );
      const known = new Set(existing.map((row) => Number(row.id)));
      if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
        throw new BadRequestException(
          'ids must list every checklist item exactly once.',
        );
      }
      await manager.query(
        `UPDATE qc_checklist_items item
            SET position = ordered.position, updated_by = $2, updated_at = NOW()
           FROM unnest($1::int[]) WITH ORDINALITY AS ordered(id, position)
          WHERE item.id = ordered.id`,
        [ids, actor.userId],
      );
      const rows: RawRow[] = await manager.query(
        `SELECT ${ITEM_COLUMNS} FROM qc_checklist_items
          WHERE is_deleted = false ORDER BY position, id`,
      );
      return rows.map(toView);
    });
  }

  private async lockTemplate(manager: EntityManager): Promise<void> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      QC_CHECKLIST_LOCK_KEY,
    ]);
  }

  private async assertNameFree(
    manager: EntityManager,
    name: string,
    exceptId?: number,
  ): Promise<void> {
    const taken: RawRow[] = await manager.query(
      `SELECT 1 FROM qc_checklist_items
        WHERE is_deleted = false AND lower(name) = lower($1)
          AND ($2::int IS NULL OR id <> $2)
        LIMIT 1`,
      [name, exceptId ?? null],
    );
    if (taken.length > 0) {
      throw new ConflictException('A checklist item with this name exists.');
    }
  }
}
