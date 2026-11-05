import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';
import { ilikeContains } from '@shared/utils/typeorm-search.util';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { requestScopeCondition } from '@plugins/sales/_shared/utils/request-scope.util';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';
import {
  ESTIMATE_CODE_PREFIX,
  ESTIMATE_CODE_UNIQUE_INDEX,
  ESTIMATE_ITEM_REFERENCE_CHECK,
  ESTIMATE_SUBMITTED_EVENT,
  ESTIMATE_TABLE,
} from '@plugins/sales/estimate/constants/estimate.constant';
import { CreateEstimateDto } from '@plugins/sales/estimate/dto/create-estimate.dto';
import { EstimateFilterDto } from '@plugins/sales/estimate/dto/estimate-filter.dto';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';
import { ESTIMATE_READ } from '@plugins/sales/estimate/permissions/estimate.permissions';
import {
  presentEstimate,
  presentEstimatePage,
} from '@plugins/sales/estimate/utils/estimate-price-visibility.util';
import {
  loadRevisionTree,
  loadRevisionView,
  recalculateRevision,
  type EstimateRevisionView,
} from '@plugins/sales/estimate/utils/estimate-revision.util';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

const ESTIMATE_LABEL = 'Estimate';

/** The roles besides the assigned engineer that may write any estimate. */
const ESTIMATE_WRITER_ROLES: readonly string[] = [
  'engineeringLead',
  'director',
];

/** Request states in which an estimate may still be written: it is being, or has been, built. */
const REQUEST_ESTIMATABLE_STATUSES: readonly RequestStatus[] = [
  RequestStatus.ESTIMATING,
  RequestStatus.ESTIMATED,
];

/** The request an estimate answers, as the list and detail show it. */
export interface EstimateRequestSummary {
  id: number;
  code: string;
  title: string;
  status: string;
  customerName: string | null;
  salesOwnerId: number;
  salesOwnerName: string | null;
  assignedEngineerId: number | null;
  assignedEngineerName: string | null;
}

export type EstimateListItem = Estimate & {
  request: EstimateRequestSummary | null;
  /** When the latest revision was priced; null while it is a draft or awaits pricing. */
  latestPricedAt: Date | null;
};

export interface EstimateRevisionSummary {
  revision: number;
  status: string;
  total: number;
  submittedAt: Date | null;
  pricedAt: Date | null;
  pricedBy: number | null;
}

export type EstimateDetail = Estimate & {
  request: EstimateRequestSummary;
  revisions: EstimateRevisionSummary[];
  /** The revision asked for, or the latest. */
  current: EstimateRevisionView;
};

/** The row of an item referenced by an estimate: any BOM line of a live estimate counts. */
const ITEM_IN_LIVE_ESTIMATE_SQL = `
  SELECT 1
  FROM sales_estimate_bom_lines line
  JOIN sales_estimate_panels panel ON panel.id = line.panel_id
  JOIN sales_estimate_revisions revision ON revision.id = panel.revision_id
  JOIN sales_estimates estimate ON estimate.id = revision.estimate_id
  WHERE line.item_id = $1 AND estimate.is_deleted = false
  LIMIT 1
`;

@Injectable()
export class EstimateService implements OnModuleInit {
  private readonly logger = new Logger(EstimateService.name);

  constructor(
    @InjectRepository(Estimate)
    private readonly estimateRepo: Repository<Estimate>,
    @InjectRepository(EstimateRevision)
    private readonly revisionRepo: Repository<EstimateRevision>,
    @InjectRepository(SalesRequest)
    private readonly requestRepo: Repository<SalesRequest>,
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly statusPort: RequestStatusPort,
    private readonly users: SalesUserLookup,
    private readonly crm: CrmGateway,
    private readonly notifications: NotificationService,
    private readonly referenceChecks: ReferenceCheckRegistry,
  ) {}

  /** An item that a live estimate's BOM names cannot be deleted: the lines keep pointing at it. */
  onModuleInit(): void {
    this.referenceChecks.registerItemCheck(
      ESTIMATE_ITEM_REFERENCE_CHECK,
      async (itemId) => {
        const rows: unknown[] = await this.dataSource.query(
          ITEM_IN_LIVE_ESTIMATE_SQL,
          [itemId],
        );
        return rows.length > 0;
      },
    );
  }

  async findAll(query: EstimateFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const where = await this.listWhere(query, actor);

    const [rows, total] = where
      ? await this.estimateRepo.findAndCount({
          where,
          skip,
          take,
          order: { updatedAt: 'DESC', id: 'DESC' },
        })
      : [[], 0];

    return presentEstimatePage(
      paginate(await this.toListItems(rows), total, page, limit),
      actor,
    );
  }

  async findOne(
    id: number,
    actor: AuthUserPayload,
    revisionNumber?: number,
  ): Promise<EstimateDetail> {
    const estimate = await this.estimateRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!estimate) throw new NotFoundException(`${ESTIMATE_LABEL} not found`);
    const request = this.dataScope.assertVisible(
      actor,
      await this.requestRepo.findOne({
        where: { id: estimate.requestId, isDeleted: false },
      }),
      ESTIMATE_LABEL,
    );

    const revisions = await this.revisionRepo.find({
      where: { estimateId: id },
      order: { revision: 'ASC' },
    });
    const wanted = revisionNumber ?? estimate.latestRevision;
    const current = revisions.find((revision) => revision.revision === wanted);
    if (!current) throw new NotFoundException('Revision not found');

    const [view, summary] = await Promise.all([
      loadRevisionView(this.dataSource.manager, current),
      this.requestSummary(request),
    ]);
    // A copy: the loaded row is not the response, so a presented detail never changes the row.
    const detail: EstimateDetail = Object.assign({}, estimate, {
      request: summary,
      revisions: revisions.map((revision) => ({
        revision: revision.revision,
        status: revision.status,
        total: revision.total,
        submittedAt: revision.submittedAt ?? null,
        pricedAt: revision.pricedAt ?? null,
        pricedBy: revision.pricedBy ?? null,
      })),
      current: view,
    });
    return presentEstimate(detail, actor);
  }

  /**
   * Starts the estimate of an assigned request: the first draft, and the request moves
   * `assigned → estimating` in the same transaction. Only the engineer the request is assigned
   * to, or an actor who sees every request, may start it.
   */
  async create(
    dto: CreateEstimateDto,
    actor: AuthUserPayload,
  ): Promise<EstimateDetail> {
    const created = await createWithDocumentCode(
      this.dataSource,
      {
        table: ESTIMATE_TABLE,
        prefix: ESTIMATE_CODE_PREFIX,
        codeUniqueIndex: ESTIMATE_CODE_UNIQUE_INDEX,
        exhaustedMessage:
          'Could not allocate an estimate code, please try again.',
      },
      async (manager, code) => {
        // The request is locked first: two creates for it serialise here, and the second finds
        // the estimate the first made instead of racing it on the unique index.
        const request = await manager.getRepository(SalesRequest).findOne({
          where: { id: dto.requestId, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        this.assertWritable(actor, request);
        const existing = await manager
          .getRepository(Estimate)
          .exists({ where: { requestId: dto.requestId, isDeleted: false } });
        if (existing) {
          throw new ConflictException('The request already has an estimate.');
        }
        await this.statusPort.advance(
          manager,
          dto.requestId,
          RequestStatus.ESTIMATING,
          { actorId: actor.userId },
        );

        const estimateRepo = manager.getRepository(Estimate);
        const estimate = await estimateRepo.save(
          estimateRepo.create({
            code,
            requestId: dto.requestId,
            status: EstimateRevisionStatus.DRAFT,
            latestRevision: 1,
            total: 0,
            createdBy: actor.userId,
            isDeleted: false,
          }),
        );
        const revisionRepo = manager.getRepository(EstimateRevision);
        await revisionRepo.save(
          revisionRepo.create({
            estimateId: estimate.id,
            revision: 1,
            status: EstimateRevisionStatus.DRAFT,
            total: 0,
            createdBy: actor.userId,
          }),
        );
        await recordRequestActivity(manager, {
          requestId: dto.requestId,
          action: 'estimate_created',
          actorId: actor.userId,
          note: code,
        });
        return estimate;
      },
    );

    return this.findOne(created.id, actor);
  }

  /**
   * Hands the draft in: it becomes read-only, the previous submitted revision is superseded,
   * and the request becomes `estimated` in the same transaction. The sales owner is notified
   * after the commit, once.
   */
  async submit(id: number, actor: AuthUserPayload): Promise<EstimateDetail> {
    const submitted = await this.dataSource.transaction(async (manager) => {
      const { estimate, request } = await this.lockForWrite(manager, id, actor);
      const revision = await this.latestRevisionOf(manager, estimate);
      this.assertDraft(revision);
      this.assertRequestEstimatable(request, 'submitted');

      const tree = await loadRevisionTree(manager, revision.id);
      if (
        tree.panels.length === 0 ||
        tree.panels.some((entry) => entry.bomLines.length === 0)
      ) {
        throw new BadRequestException(
          'An estimate needs at least one panel, and every panel needs a BOM line.',
        );
      }
      // The stored figures are written by every edit; recomputing here makes sure that what
      // gets frozen is what the server calculates, not what the last edit left behind.
      await recalculateRevision(manager, revision, estimate);

      const revisionRepo = manager.getRepository(EstimateRevision);
      // The superseded row goes first: at most one revision per estimate may be `submitted`.
      const previous = await revisionRepo.find({
        where: {
          estimateId: estimate.id,
          status: EstimateRevisionStatus.SUBMITTED,
        },
      });
      for (const old of previous) {
        old.status = EstimateRevisionStatus.SUPERSEDED;
        await revisionRepo.save(old);
      }
      revision.status = EstimateRevisionStatus.SUBMITTED;
      revision.submittedAt = new Date();
      revision.submittedBy = actor.userId;
      await revisionRepo.save(revision);

      estimate.status = EstimateRevisionStatus.SUBMITTED;
      estimate.updatedBy = actor.userId;
      await manager.getRepository(Estimate).save(estimate);

      await this.statusPort.advance(
        manager,
        request.id,
        RequestStatus.ESTIMATED,
        {
          actorId: actor.userId,
        },
      );
      await recordRequestActivity(manager, {
        requestId: request.id,
        action: 'estimate_submitted',
        actorId: actor.userId,
        note: `${estimate.code} #${revision.revision}`,
      });
      return { estimate, request, revision: revision.revision };
    });

    await this.notifySubmitted(
      submitted.estimate,
      submitted.request,
      submitted.revision,
      actor,
    );
    return this.findOne(id, actor);
  }

  /**
   * Opens a new draft revision copied from the latest submitted one. The submitted revision
   * stays current (and is what a quotation reads) until the draft is submitted. Possible only
   * while the request is being estimated or has been estimated, never once it is quoted.
   */
  async revise(id: number, actor: AuthUserPayload): Promise<EstimateDetail> {
    await this.dataSource.transaction(async (manager) => {
      const { estimate, request } = await this.lockForWrite(manager, id, actor);
      this.assertRequestEstimatable(request, 'revised');
      const latest = await this.latestRevisionOf(manager, estimate);
      if (latest.status !== EstimateRevisionStatus.SUBMITTED) {
        throw new ConflictException(
          `Revision ${latest.revision} is still a draft; submit it before revising.`,
        );
      }

      const revisionRepo = manager.getRepository(EstimateRevision);
      const draft = await revisionRepo.save(
        revisionRepo.create({
          estimateId: estimate.id,
          revision: latest.revision + 1,
          status: EstimateRevisionStatus.DRAFT,
          total: latest.total,
          createdBy: actor.userId,
        }),
      );
      await this.copyTree(manager, latest.id, draft.id);

      estimate.status = EstimateRevisionStatus.DRAFT;
      estimate.latestRevision = draft.revision;
      estimate.updatedBy = actor.userId;
      await manager.getRepository(Estimate).save(estimate);

      await recordRequestActivity(manager, {
        requestId: request.id,
        action: 'estimate_revised',
        actorId: actor.userId,
        note: `${estimate.code} #${draft.revision}`,
      });
    });

    return this.findOne(id, actor);
  }

  /**
   * Locks the estimate, then its request, for the rest of the transaction and checks the actor
   * may write it. Every write takes the locks in this order, so concurrent submits, revises and
   * edits of one estimate run one after another and none acts on a status it read before.
   */
  async lockForWrite(
    manager: EntityManager,
    id: number,
    actor: AuthUserPayload,
  ): Promise<{ estimate: Estimate; request: SalesRequest }> {
    const estimate = await manager.getRepository(Estimate).findOne({
      where: { id, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!estimate) throw new NotFoundException(`${ESTIMATE_LABEL} not found`);
    const request = await manager.getRepository(SalesRequest).findOne({
      where: { id: estimate.requestId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    return { estimate, request: this.assertWritable(actor, request) };
  }

  /** The newest revision of the estimate; every estimate has one. */
  async latestRevisionOf(
    manager: EntityManager,
    estimate: Estimate,
  ): Promise<EstimateRevision> {
    const revision = await manager.getRepository(EstimateRevision).findOne({
      where: { estimateId: estimate.id, revision: estimate.latestRevision },
    });
    if (!revision) throw new NotFoundException('Revision not found');
    return revision;
  }

  /** Only a draft revision is editable or submittable; the others are read-only. */
  assertDraft(revision: EstimateRevision): void {
    if (revision.status !== EstimateRevisionStatus.DRAFT) {
      throw new ConflictException(
        `Revision ${revision.revision} is ${revision.status} and read-only; revise the estimate to change it.`,
      );
    }
  }

  assertRequestEstimatable(request: SalesRequest, doing: string): void {
    if (!REQUEST_ESTIMATABLE_STATUSES.includes(request.status)) {
      throw new ConflictException(
        `An estimate of a request ${request.status} cannot be ${doing}.`,
      );
    }
  }

  /**
   * The request is visible to the actor (404 otherwise) and the actor is the engineer it is
   * assigned to, an engineering lead or the director. Anyone else, the administrator
   * included, answers 404 like a record out of scope.
   */
  private assertWritable(
    actor: AuthUserPayload,
    request: SalesRequest | null,
  ): SalesRequest {
    const visible = this.dataScope.assertVisible(
      actor,
      request,
      ESTIMATE_LABEL,
    );
    const mayWrite =
      (actor.role !== undefined &&
        ESTIMATE_WRITER_ROLES.includes(actor.role)) ||
      visible.assignedEngineerId === actor.userId;
    if (!mayWrite) throw new NotFoundException(`${ESTIMATE_LABEL} not found`);
    return visible;
  }

  /** Copies panels, BOM lines (snapshots included) and cost lines into another revision. */
  private async copyTree(
    manager: EntityManager,
    fromRevisionId: number,
    toRevisionId: number,
  ): Promise<void> {
    const tree = await loadRevisionTree(manager, fromRevisionId);
    const panelRepo = manager.getRepository(EstimatePanel);
    const bomRepo = manager.getRepository(EstimateBomLine);
    const costRepo = manager.getRepository(EstimateCostLine);

    for (const { panel, bomLines, costLines } of tree.panels) {
      const copy = await panelRepo.save(
        panelRepo.create({
          revisionId: toRevisionId,
          tag: panel.tag,
          description: panel.description ?? null,
          quantity: panel.quantity,
          unitCost: panel.unitCost,
          total: panel.total,
        }),
      );
      for (const line of bomLines) {
        await bomRepo.save(
          bomRepo.create({
            panelId: copy.id,
            itemId: line.itemId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            itemBrand: line.itemBrand ?? null,
            itemUnit: line.itemUnit,
            quantity: line.quantity,
            unitCost: line.unitCost,
            amount: line.amount,
            note: line.note ?? null,
          }),
        );
      }
      for (const line of costLines) {
        await costRepo.save(
          costRepo.create({
            panelId: copy.id,
            category: line.category,
            description: line.description ?? null,
            amount: line.amount,
          }),
        );
      }
    }
  }

  /**
   * The list's conditions: the actor's data scope and the toolbar filters resolved through the
   * requests the estimates answer. `null` means nothing can match, so no query is needed.
   */
  private async listWhere(
    query: EstimateFilterDto,
    actor: AuthUserPayload,
  ): Promise<Record<string, unknown> | Array<Record<string, unknown>> | null> {
    const requestWhere: Record<string, unknown> = {
      isDeleted: false,
      ...requestScopeCondition(this.dataScope.scopeOf(actor), actor.userId),
    };
    if (query.assignedEngineerId !== undefined) {
      const pinned = requestWhere.assignedEngineerId;
      if (pinned !== undefined && pinned !== query.assignedEngineerId) {
        return null;
      }
      requestWhere.assignedEngineerId = query.assignedEngineerId;
    }
    if (query.requestId !== undefined) requestWhere.id = query.requestId;

    const keyword = query.search?.trim();
    const restricted = Object.keys(requestWhere).length > 1;
    const allowed = restricted
      ? (
          await this.requestRepo.find({
            where: requestWhere,
            select: { id: true },
          })
        ).map((request) => request.id)
      : null;
    if (allowed?.length === 0) return null;

    const base: Record<string, unknown> = { isDeleted: false };
    if (query.status) base.status = query.status;
    const scoped = allowed ? { ...base, requestId: In(allowed) } : base;
    if (!keyword) return scoped;

    // The keyword finds an estimate by its own code or by the code or title of its request.
    const matching = (
      await this.requestRepo.find({
        where: [
          { ...requestWhere, code: ilikeContains(keyword) },
          { ...requestWhere, title: ilikeContains(keyword) },
        ],
        select: { id: true },
      })
    ).map((request) => request.id);
    return [
      { ...scoped, code: ilikeContains(keyword) },
      ...(matching.length > 0 ? [{ ...base, requestId: In(matching) }] : []),
    ];
  }

  private async toListItems(rows: Estimate[]): Promise<EstimateListItem[]> {
    if (rows.length === 0) return [];
    const requests = await this.requestRepo.find({
      where: { id: In(rows.map((row) => row.requestId)) },
      withDeleted: true,
    });
    const byId = new Map(requests.map((request) => [request.id, request]));
    const latest = await this.revisionRepo.find({
      where: { estimateId: In(rows.map((row) => row.id)) },
    });
    const [customers, names] = await Promise.all([
      this.crm.getCustomerSummaries(requests.map((r) => r.customerId)),
      this.users.namesOf(
        requests.flatMap((r) => [r.salesOwnerId, r.assignedEngineerId]),
      ),
    ]);

    return rows.map((row) => {
      const request = byId.get(row.requestId);
      const pricedAt = latest.find(
        (revision) =>
          revision.estimateId === row.id &&
          revision.revision === row.latestRevision,
      )?.pricedAt;
      return Object.assign(row, {
        latestPricedAt: pricedAt ?? null,
        request: request
          ? this.summaryOf(
              request,
              customers.get(request.customerId)?.name ?? null,
              names,
            )
          : null,
      });
    });
  }

  private async requestSummary(
    request: SalesRequest,
  ): Promise<EstimateRequestSummary> {
    const [customer, names] = await Promise.all([
      this.crm.getCustomerSummary(request.customerId),
      this.users.namesOf([request.salesOwnerId, request.assignedEngineerId]),
    ]);
    return this.summaryOf(request, customer?.name ?? null, names);
  }

  private summaryOf(
    request: SalesRequest,
    customerName: string | null,
    names: Map<number, string>,
  ): EstimateRequestSummary {
    return {
      id: request.id,
      code: request.code,
      title: request.title,
      status: request.status,
      customerName,
      salesOwnerId: request.salesOwnerId,
      salesOwnerName: names.get(request.salesOwnerId) ?? null,
      assignedEngineerId: request.assignedEngineerId ?? null,
      assignedEngineerName: request.assignedEngineerId
        ? (names.get(request.assignedEngineerId) ?? null)
        : null,
    };
  }

  /** The sales owner is told after the commit; a failed notice must not undo a submission. */
  private async notifySubmitted(
    estimate: Estimate,
    request: SalesRequest,
    revision: number,
    actor: AuthUserPayload,
  ): Promise<void> {
    try {
      await this.notifications.emit({
        eventType: ESTIMATE_SUBMITTED_EVENT,
        roleCodes: [],
        userIds: [request.salesOwnerId],
        // The bell phrases the event from the payload; the text is the fallback for a reader
        // whose client does not know the event.
        message: `${estimate.code} — ${request.code}`,
        requiredScope: ESTIMATE_READ,
        link: `/sales/estimates/${estimate.id}`,
        payload: {
          estimateId: estimate.id,
          code: estimate.code,
          revision,
          requestId: request.id,
          requestCode: request.code,
        },
        createdBy: actor.userId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not notify the sales owner of estimate ${estimate.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
