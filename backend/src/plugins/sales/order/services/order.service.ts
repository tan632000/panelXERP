import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { requestScopeCondition } from '@plugins/sales/_shared/utils/request-scope.util';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { OrderFilterDto } from '@plugins/sales/order/dto/order-filter.dto';
import { SalesOrderBomLine } from '@plugins/sales/order/entities/order-bom-line.entity';
import { SalesOrderLine } from '@plugins/sales/order/entities/order-line.entity';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { ORDER_LABEL } from '@plugins/sales/order/utils/order-lock.util';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

export interface OrderBomLineView {
  id: number;
  itemCode: string;
  itemName: string;
  itemBrand: string | null;
  itemUnit: string;
  quantity: number;
}

export interface OrderLineView {
  id: number;
  tag: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  bomLines: OrderBomLineView[];
}

/** The documents the order came from, for the chain breadcrumb. */
export interface OrderChain {
  request: { id: number; code: string; title: string; status: string };
  estimate: { id: number; code: string; revision: number };
  quotation: { id: number; code: string; ver: number };
}

export type OrderListItem = SalesOrder & {
  request: { id: number; code: string } | null;
};

export type OrderDetail = SalesOrder & {
  lines: OrderLineView[];
  chain: OrderChain;
  cancelledByName: string | null;
};

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine)
    private readonly lineRepo: Repository<SalesOrderLine>,
    @InjectRepository(SalesOrderBomLine)
    private readonly bomRepo: Repository<SalesOrderBomLine>,
    @InjectRepository(SalesRequest)
    private readonly requestRepo: Repository<SalesRequest>,
    @InjectRepository(Estimate)
    private readonly estimateRepo: Repository<Estimate>,
    @InjectRepository(Quotation)
    private readonly quotationRepo: Repository<Quotation>,
    private readonly dataScope: DataScopeService,
    private readonly users: SalesUserLookup,
  ) {}

  async findAll(query: OrderFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .innerJoin(
        SalesRequest,
        'request',
        'request.id = o.request_id AND request.is_deleted = false',
      )
      .where('o.is_deleted = false');

    // The scope sits in the query, so a page never holds a row the detail would answer 404.
    const scope = requestScopeCondition(
      this.dataScope.scopeOf(actor),
      actor.userId,
    );
    if (scope.salesOwnerId !== undefined) {
      qb.andWhere('request.sales_owner_id = :ownerId', {
        ownerId: scope.salesOwnerId,
      });
    }
    if (scope.assignedEngineerId !== undefined) {
      qb.andWhere('request.assigned_engineer_id = :engineerId', {
        engineerId: scope.assignedEngineerId,
      });
    }
    if (query.status) {
      qb.andWhere('o.status = :status', { status: query.status });
    }
    if (query.customerId !== undefined) {
      qb.andWhere('o.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.quotationId !== undefined) {
      qb.andWhere('o.quotation_id = :quotationId', {
        quotationId: query.quotationId,
      });
    }
    const code = query.code?.trim();
    if (code) {
      qb.andWhere('erp_unaccent(o.code) ILIKE erp_unaccent(:code)', {
        code: `%${escapeLikePattern(code)}%`,
      });
    }
    // The keyword finds an order by its code, its customer, its contract or its request code.
    const keyword = query.search?.trim();
    if (keyword) {
      qb.andWhere(
        `(erp_unaccent(o.code) ILIKE erp_unaccent(:keyword)
          OR erp_unaccent(o.customer_name) ILIKE erp_unaccent(:keyword)
          OR erp_unaccent(COALESCE(o.contract_no, '')) ILIKE erp_unaccent(:keyword)
          OR erp_unaccent(request.code) ILIKE erp_unaccent(:keyword))`,
        { keyword: `%${escapeLikePattern(keyword)}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return paginate(await this.toListItems(rows), total, page, limit);
  }

  async findOne(id: number, actor: AuthUserPayload): Promise<OrderDetail> {
    const order = await this.orderRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!order) throw new NotFoundException(`${ORDER_LABEL} not found`);
    const request = this.dataScope.assertVisible(
      actor,
      await this.requestRepo.findOne({
        where: { id: order.requestId, isDeleted: false },
      }),
      ORDER_LABEL,
    );

    const [lines, estimate, quotation, names] = await Promise.all([
      this.loadLines(order.id),
      this.estimateRepo.findOne({
        where: { id: order.estimateId },
        withDeleted: true,
      }),
      this.quotationRepo.findOne({
        where: { id: order.quotationId },
        withDeleted: true,
      }),
      this.users.namesOf([order.cancelledBy]),
    ]);
    return Object.assign(order, {
      lines,
      chain: {
        request: {
          id: request.id,
          code: request.code,
          title: request.title,
          status: request.status,
        },
        estimate: {
          id: order.estimateId,
          code: estimate?.code ?? '',
          revision: order.estimateRevision,
        },
        quotation: {
          id: order.quotationId,
          code: quotation?.code ?? '',
          ver: order.quotationVer,
        },
      },
      cancelledByName: order.cancelledBy
        ? (names.get(order.cancelledBy) ?? null)
        : null,
    });
  }

  private async loadLines(orderId: number): Promise<OrderLineView[]> {
    const lines = await this.lineRepo.find({
      where: { orderId },
      order: { id: 'ASC' },
    });
    if (lines.length === 0) return [];
    const bomLines = await this.bomRepo.find({
      where: { lineId: In(lines.map((line) => line.id)) },
      order: { id: 'ASC' },
    });
    return lines.map((line) => ({
      id: line.id,
      tag: line.tag,
      description: line.description ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      bomLines: bomLines
        .filter((bom) => bom.lineId === line.id)
        .map((bom) => ({
          id: bom.id,
          itemCode: bom.itemCode,
          itemName: bom.itemName,
          itemBrand: bom.itemBrand ?? null,
          itemUnit: bom.itemUnit,
          quantity: bom.quantity,
        })),
    }));
  }

  private async toListItems(rows: SalesOrder[]): Promise<OrderListItem[]> {
    if (rows.length === 0) return [];
    const requests = await this.requestRepo.find({
      where: { id: In(rows.map((row) => row.requestId)) },
      withDeleted: true,
    });
    const byId = new Map(requests.map((request) => [request.id, request]));
    return rows.map((row) => {
      const request = byId.get(row.requestId);
      return Object.assign(row, {
        request: request ? { id: request.id, code: request.code } : null,
      });
    });
  }
}
