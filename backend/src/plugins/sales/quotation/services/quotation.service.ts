import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { EstimateReadPort } from '@plugins/sales/_shared/ports/estimate-read.port';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { requestScopeCondition } from '@plugins/sales/_shared/utils/request-scope.util';
import {
  createWithDocumentCode,
  dailyDocumentCode,
} from '@plugins/sales/_shared/utils/sales-document-code.util';
import {
  DEFAULT_VAT_RATE,
  QUOTATION_CODE_PREFIX,
  QUOTATION_CODE_UNIQUE_INDEX,
  QUOTATION_TABLE,
} from '@plugins/sales/quotation/constants/quotation.constant';
import { CreateQuotationDto } from '@plugins/sales/quotation/dto/create-quotation.dto';
import { QuotationFilterDto } from '@plugins/sales/quotation/dto/quotation-filter.dto';
import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';
import { QuotationVersionStatus } from '@plugins/sales/quotation/enums/quotation-version-status.enum';
import {
  loadVersionTree,
  recalculateVersion,
  snapshotEstimatePanels,
  toVersionView,
  type QuotationVersionView,
} from '@plugins/sales/quotation/utils/quotation-version.util';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const QUOTATION_LABEL = 'Quotation';
const REQUEST_LABEL = 'Request';

/** The one request state a quotation may be started from; approval moves it on later. */
const REQUEST_QUOTABLE_STATUSES: readonly RequestStatus[] = [
  RequestStatus.ESTIMATED,
];

/** The request a quotation answers, as the list and detail show it. */
export interface QuotationRequestSummary {
  id: number;
  code: string;
  title: string;
  status: string;
  customerId: number;
  customerName: string | null;
  salesOwnerId: number;
  salesOwnerName: string | null;
}

export interface QuotationVersionSummary {
  ver: number;
  status: string;
  total: number;
  createdAt: Date;
}

export type QuotationListItem = Quotation & {
  request: QuotationRequestSummary | null;
  /** The latest version. */
  latest: QuotationVersionSummary | null;
};

export type QuotationDetail = Quotation & {
  request: QuotationRequestSummary;
  versions: QuotationVersionSummary[];
  /** The version asked for, or the latest. */
  current: QuotationVersionView;
};

@Injectable()
export class QuotationService {
  constructor(
    @InjectRepository(Quotation)
    private readonly quotationRepo: Repository<Quotation>,
    @InjectRepository(QuotationVersion)
    private readonly versionRepo: Repository<QuotationVersion>,
    @InjectRepository(SalesRequest)
    private readonly requestRepo: Repository<SalesRequest>,
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly estimates: EstimateReadPort,
    private readonly users: SalesUserLookup,
    private readonly crm: CrmGateway,
  ) {}

  async findAll(query: QuotationFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const qb = this.quotationRepo
      .createQueryBuilder('quotation')
      .innerJoin(
        SalesRequest,
        'request',
        'request.id = quotation.request_id AND request.is_deleted = false',
      )
      .innerJoin(
        QuotationVersion,
        'latest',
        'latest.quotation_id = quotation.id AND latest.ver = quotation.latest_ver',
      )
      .where('quotation.is_deleted = false');

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
      qb.andWhere('latest.status = :status', { status: query.status });
    }
    if (query.customerId !== undefined) {
      qb.andWhere('request.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.requestId !== undefined) {
      qb.andWhere('quotation.request_id = :requestId', {
        requestId: query.requestId,
      });
    }
    const code = query.code?.trim();
    if (code) {
      qb.andWhere(`erp_unaccent(quotation.code) ILIKE erp_unaccent(:code)`, {
        code: `%${escapeLikePattern(code)}%`,
      });
    }
    // The keyword finds a quotation by its own code or by the code or title of its request.
    const keyword = query.search?.trim();
    if (keyword) {
      qb.andWhere(
        `(erp_unaccent(quotation.code) ILIKE erp_unaccent(:keyword)
          OR erp_unaccent(request.code) ILIKE erp_unaccent(:keyword)
          OR erp_unaccent(request.title) ILIKE erp_unaccent(:keyword))`,
        { keyword: `%${escapeLikePattern(keyword)}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy('quotation.updatedAt', 'DESC')
      .addOrderBy('quotation.id', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return paginate(await this.toListItems(rows), total, page, limit);
  }

  async findOne(
    id: number,
    actor: AuthUserPayload,
    ver?: number,
  ): Promise<QuotationDetail> {
    const quotation = await this.quotationRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!quotation) throw new NotFoundException(`${QUOTATION_LABEL} not found`);
    const request = this.dataScope.assertVisible(
      actor,
      await this.requestRepo.findOne({
        where: { id: quotation.requestId, isDeleted: false },
      }),
      QUOTATION_LABEL,
    );

    const versions = await this.versionRepo.find({
      where: { quotationId: id },
      order: { ver: 'ASC' },
    });
    const wanted = ver ?? quotation.latestVer;
    const current = versions.find((version) => version.ver === wanted);
    if (!current) throw new NotFoundException('Version not found');

    const [tree, summary] = await Promise.all([
      loadVersionTree(this.dataSource.manager, current.id),
      this.requestSummary(request),
    ]);
    return Object.assign(quotation, {
      request: summary,
      versions: versions.map((version) => this.versionSummary(version)),
      current: toVersionView(current, tree),
    });
  }

  /**
   * Quotes an estimated request from its latest submitted estimate revision: version 1 as a
   * draft with one line per panel (margin 0, the estimate's cost) and the panels' BOM copied
   * for the customer-facing output. The request stays `estimated`; approval moves it on later.
   *
   * Locks go estimate (shared) → request: the estimate's own submit and revise take the same
   * order, so the paths cannot deadlock, and the revision read here is not replaced mid-create.
   */
  async create(
    dto: CreateQuotationDto,
    actor: AuthUserPayload,
  ): Promise<QuotationDetail> {
    // Out-of-scope answers 404 before anything about the request's estimate is revealed.
    this.dataScope.assertVisible(
      actor,
      await this.requestRepo.findOne({
        where: { id: dto.requestId, isDeleted: false },
      }),
      REQUEST_LABEL,
    );

    const created = await createWithDocumentCode(
      this.dataSource,
      {
        table: QUOTATION_TABLE,
        prefix: QUOTATION_CODE_PREFIX,
        codeUniqueIndex: QUOTATION_CODE_UNIQUE_INDEX,
        format: dailyDocumentCode,
        exhaustedMessage:
          'Could not allocate a quotation code, please try again.',
      },
      async (manager, code) => {
        const estimate = await this.estimates.getLatestSubmitted(
          manager,
          dto.requestId,
          { lock: true },
        );
        if (!estimate) {
          throw new ConflictException(
            'The request has no submitted estimate to quote.',
          );
        }
        if (
          dto.estimateRevisionId !== undefined &&
          dto.estimateRevisionId !== estimate.revisionId
        ) {
          throw new ConflictException(
            `Revision ${dto.estimateRevisionId} is not the latest submitted estimate revision (${estimate.revision}).`,
          );
        }

        // Taken after the estimate, and held to the end: two creates for one request serialise
        // here, so the second finds the quotation the first made.
        const request = this.dataScope.assertVisible(
          actor,
          await manager.getRepository(SalesRequest).findOne({
            where: { id: dto.requestId, isDeleted: false },
            lock: { mode: 'pessimistic_write' },
          }),
          REQUEST_LABEL,
        );
        if (!REQUEST_QUOTABLE_STATUSES.includes(request.status)) {
          throw new ConflictException(
            `A request ${request.status} cannot be quoted.`,
          );
        }
        const existing = await manager.getRepository(Quotation).exists({
          where: { requestId: request.id, isDeleted: false },
        });
        if (existing) {
          throw new ConflictException('The request already has a quotation.');
        }

        const quotationRepo = manager.getRepository(Quotation);
        const quotation = await quotationRepo.save(
          quotationRepo.create({
            code,
            requestId: request.id,
            estimateId: estimate.estimateId,
            latestVer: 1,
            createdBy: actor.userId,
            isDeleted: false,
          }),
        );
        const versionRepo = manager.getRepository(QuotationVersion);
        const version = await versionRepo.save(
          versionRepo.create({
            quotationId: quotation.id,
            ver: 1,
            status: QuotationVersionStatus.DRAFT,
            estimateRevisionId: estimate.revisionId,
            estimateRevision: estimate.revision,
            discountType: DiscountType.PERCENT,
            discountValue: 0,
            vatRate: DEFAULT_VAT_RATE,
            createdBy: actor.userId,
          }),
        );
        const tree = await snapshotEstimatePanels(
          manager,
          version.id,
          estimate.panels,
        );
        await recalculateVersion(manager, version, tree);
        await recordRequestActivity(manager, {
          requestId: request.id,
          action: 'quotation_created',
          actorId: actor.userId,
          note: code,
        });
        return quotation;
      },
    );

    return this.findOne(created.id, actor);
  }

  private versionSummary(version: QuotationVersion): QuotationVersionSummary {
    return {
      ver: version.ver,
      status: version.status,
      total: version.total,
      createdAt: version.createdAt,
    };
  }

  private async toListItems(rows: Quotation[]): Promise<QuotationListItem[]> {
    if (rows.length === 0) return [];
    const requests = await this.requestRepo.find({
      where: { id: In(rows.map((row) => row.requestId)) },
      withDeleted: true,
    });
    const byId = new Map(requests.map((request) => [request.id, request]));
    const versions = await this.versionRepo.find({
      where: rows.map((row) => ({
        quotationId: row.id,
        ver: row.latestVer,
      })),
    });
    const [customers, names] = await Promise.all([
      this.crm.getCustomerSummaries(requests.map((r) => r.customerId)),
      this.users.namesOf(requests.map((r) => r.salesOwnerId)),
    ]);

    return rows.map((row) => {
      const request = byId.get(row.requestId);
      const latest = versions.find(
        (version) =>
          version.quotationId === row.id && version.ver === row.latestVer,
      );
      return Object.assign(row, {
        request: request
          ? this.summaryOf(
              request,
              customers.get(request.customerId)?.name ?? null,
              names,
            )
          : null,
        latest: latest ? this.versionSummary(latest) : null,
      });
    });
  }

  private async requestSummary(
    request: SalesRequest,
  ): Promise<QuotationRequestSummary> {
    const [customer, names] = await Promise.all([
      this.crm.getCustomerSummary(request.customerId),
      this.users.namesOf([request.salesOwnerId]),
    ]);
    return this.summaryOf(request, customer?.name ?? null, names);
  }

  private summaryOf(
    request: SalesRequest,
    customerName: string | null,
    names: Map<number, string>,
  ): QuotationRequestSummary {
    return {
      id: request.id,
      code: request.code,
      title: request.title,
      status: request.status,
      customerId: request.customerId,
      customerName,
      salesOwnerId: request.salesOwnerId,
      salesOwnerName: names.get(request.salesOwnerId) ?? null,
    };
  }
}
