import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { resolvePagination } from '@shared/utils/pagination.util';

import { InstallationFilterDto } from '@plugins/delivery/installation/dto/installation.dto';
import {
  INSTALLATION_NOT_FOUND,
  InstallationAccess,
} from '@plugins/delivery/installation/services/installation-access.service';
import {
  INSTALLATION_SELECT,
  PHOTO_SELECT,
  toInstallationSummary,
  toPhotoView,
  type InstallationDetail,
  type RawRow,
} from '@plugins/delivery/installation/services/installation-views';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * Every read of installations. The actor's scope is a condition in SQL on the order id, so an
 * installation outside it answers 404 like one that does not exist.
 */
@Injectable()
export class InstallationQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: InstallationAccess,
    private readonly headers: OrderMaterialReadPort,
  ) {}

  async list(query: InstallationFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const manager = this.dataSource.manager;
    const reach = this.access.orderScope(actor)('i.order_id');
    const params: unknown[] = [...reach.params];
    const where = ['i.is_deleted = false', reach.sql];
    if (query.status) {
      params.push(query.status);
      where.push(`i.status = $${params.length}`);
    }
    if (query.orderId !== undefined) {
      params.push(query.orderId);
      where.push(`i.order_id = $${params.length}`);
    }
    const condition = where.map((part) => `(${part})`).join(' AND ');
    const [{ total }]: Array<{ total: string }> = await manager.query(
      `SELECT COUNT(*) AS total FROM installations i WHERE ${condition}`,
      params,
    );
    const rows: RawRow[] = await manager.query(
      `${INSTALLATION_SELECT} WHERE ${condition} ORDER BY i.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip],
    );
    const orders = await this.headers.getOrders(
      manager,
      rows.map((row) => Number(row.order_id)),
    );
    return paginate(
      rows.map((row) =>
        toInstallationSummary(row, orders.get(Number(row.order_id))),
      ),
      Number(total),
      page,
      limit,
    );
  }

  async get(
    installationId: number,
    actor: AuthUserPayload,
  ): Promise<InstallationDetail> {
    const manager = this.dataSource.manager;
    const reach = this.access.orderScope(actor)('i.order_id');
    const [row]: RawRow[] = await manager.query(
      `${INSTALLATION_SELECT}
        WHERE i.id = $${reach.params.length + 1} AND i.is_deleted = false AND (${reach.sql})`,
      [...reach.params, installationId],
    );
    if (!row) throw new NotFoundException(INSTALLATION_NOT_FOUND);
    const photos: RawRow[] = await manager.query(
      `${PHOTO_SELECT} WHERE p.installation_id = $1 AND p.is_deleted = false ORDER BY p.id`,
      [installationId],
    );
    const header = await this.headers.getOrder(manager, Number(row.order_id));
    return {
      ...toInstallationSummary(row, header),
      photos: photos.map(toPhotoView),
    };
  }
}
