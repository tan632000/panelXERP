import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import {
  applyListWhere,
  findColumnValues,
  mergeColumnFilterConditions,
  toListScopeQuery,
  type ColumnFilterMap,
} from '@shared/utils/column-filter.util';
import { toColumnSortOrder } from '@shared/utils/column-sort.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';

import {
  CrmGateway,
  type CustomerSummary,
} from '@plugins/crm/_shared/gateways/crm-gateway';
import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { RequestCloseRegistry } from '@plugins/sales/_shared/ports/request-close-registry';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { requestScopeCondition } from '@plugins/sales/_shared/utils/request-scope.util';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';
import {
  requireText,
  trimToNull,
} from '@plugins/sales/_shared/utils/text.util';
import {
  REQUEST_ASSIGNABLE_STATUSES,
  REQUEST_EDITABLE_STATUSES,
} from '@plugins/sales/request/constants/request-status-transitions.constant';
import {
  REQUEST_ASSIGNED_EVENT,
  REQUEST_CODE_PREFIX,
  REQUEST_CODE_UNIQUE_INDEX,
  REQUEST_ENGINEER_ROLE_CODES,
  REQUEST_TABLE,
} from '@plugins/sales/request/constants/request.constant';
import { AssignRequestDto } from '@plugins/sales/request/dto/assign-request.dto';
import { CreateRequestDto } from '@plugins/sales/request/dto/create-request.dto';
import {
  RequestColumnValuesQueryDto,
  RequestFilterDto,
} from '@plugins/sales/request/dto/request-filter.dto';
import { RequestReasonDto } from '@plugins/sales/request/dto/request-reason.dto';
import { UpdateRequestDto } from '@plugins/sales/request/dto/update-request.dto';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import { REQUEST_READ } from '@plugins/sales/request/permissions/request.permissions';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** Columns the list table filters and enumerates values for. Text columns only. */
export const REQUEST_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  title: { field: 'title' },
  status: { field: 'status' },
};

/** A request as the list returns it: the row plus the names its cells show. */
export type RequestListItem = SalesRequest & {
  customerCode: string | null;
  customerName: string | null;
  salesOwnerName: string | null;
  assignedEngineerName: string | null;
};

/**
 * A request as its detail page reads it. The customer, project and contact are embedded so an
 * assigned engineer, who holds no customer or project read permission, still sees who the
 * work is for.
 */
export type RequestDetail = SalesRequest & {
  salesOwnerName: string | null;
  assignedEngineerName: string | null;
  customer: {
    id: number;
    code: string;
    name: string;
    taxCode: string | null;
    address: string | null;
  } | null;
  project: {
    id: number;
    code: string;
    name: string;
    siteAddress: string | null;
  } | null;
  contact: {
    id: number;
    name: string;
    position: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

export interface RequestActivityView {
  id: number;
  action: string;
  actorId: number | null;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Date;
}

const REQUEST_LABEL = 'Request';
const CUSTOMER_LABEL = 'Customer';
/** Name the request registers under at the customer and project delete checks. */
const REFERENCE_CHECK_NAME = 'request';

@Injectable()
export class RequestService implements OnModuleInit {
  private readonly logger = new Logger(RequestService.name);

  constructor(
    @InjectRepository(SalesRequest)
    private readonly requestRepo: Repository<SalesRequest>,
    @InjectRepository(SalesRequestActivity)
    private readonly activityRepo: Repository<SalesRequestActivity>,
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly crm: CrmGateway,
    private readonly users: SalesUserLookup,
    private readonly notifications: NotificationService,
    private readonly statusPort: RequestStatusPort,
    private readonly referenceChecks: ReferenceCheckRegistry,
    private readonly ownerChanges: CustomerOwnerChangeRegistry,
    private readonly closeHooks: RequestCloseRegistry,
  ) {}

  /** A customer or project a live request points at cannot be deleted: the request keeps naming it. */
  onModuleInit(): void {
    this.referenceChecks.registerCustomerCheck(
      REFERENCE_CHECK_NAME,
      (customerId) =>
        this.requestRepo.exists({ where: { customerId, isDeleted: false } }),
    );
    this.referenceChecks.registerProjectCheck(
      REFERENCE_CHECK_NAME,
      (projectId) =>
        this.requestRepo.exists({ where: { projectId, isDeleted: false } }),
    );
    // A request is always its customer's: when the customer is reassigned, every request of
    // it moves to the new owner in the same transaction, whatever its status.
    this.ownerChanges.register(
      REFERENCE_CHECK_NAME,
      async (manager, customerId, newOwnerId) => {
        const moving = (
          await manager.getRepository(SalesRequest).find({
            where: { customerId },
            select: { id: true, salesOwnerId: true },
            withDeleted: true,
          })
        )
          .filter((row) => row.salesOwnerId !== newOwnerId)
          .map((row) => ({ id: row.id, from: row.salesOwnerId }));
        if (moving.length === 0) return;

        await manager.update(
          SalesRequest,
          { customerId },
          { salesOwnerId: newOwnerId },
        );
        const names = await this.users.namesOf([
          newOwnerId,
          ...moving.map((row) => row.from),
        ]);
        for (const row of moving) {
          await recordRequestActivity(manager, {
            requestId: row.id,
            action: 'owner_changed',
            note: `${names.get(row.from) ?? row.from} → ${names.get(newOwnerId) ?? newOwnerId}`,
          });
        }
      },
    );
  }

  /** The list's filters and data-scope conditions, before any column selection. */
  private listWhere(
    query: Pick<
      RequestFilterDto,
      | 'search'
      | 'status'
      | 'assignedEngineerId'
      | 'quotationDueFrom'
      | 'quotationDueTo'
    >,
    actor: AuthUserPayload,
  ) {
    const scoped = requestScopeCondition(
      this.dataScope.scopeOf(actor),
      actor.userId,
    );
    const base: Record<string, unknown> = { isDeleted: false, ...scoped };

    if (query.status) base.status = query.status;

    if (query.assignedEngineerId !== undefined) {
      // An engineer's scope already pins the engineer: asking for another one matches nothing.
      const pinned = scoped.assignedEngineerId;
      base.assignedEngineerId =
        pinned === undefined || pinned === query.assignedEngineerId
          ? query.assignedEngineerId
          : In([]);
    }

    const { quotationDueFrom: from, quotationDueTo: to } = query;
    if (from && to) base.quotationDueDate = Between(from, to);
    else if (from) base.quotationDueDate = MoreThanOrEqual(from);
    else if (to) base.quotationDueDate = LessThanOrEqual(to);

    return buildIlikeOrWhere(base, ['code', 'title'], query.search);
  }

  async findAll(query: RequestFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const where = mergeColumnFilterConditions(
      this.listWhere(query, actor),
      REQUEST_COLUMN_FILTERS,
      query.columnFilters,
    );
    const order = toColumnSortOrder<SalesRequest>({
      map: REQUEST_COLUMN_FILTERS,
      query,
      fallback: { field: 'createdAt', direction: 'DESC' },
    });

    const [rows, total] = await this.requestRepo.findAndCount({
      where,
      skip,
      take,
      order,
    });

    return paginate(await this.toListItems(rows), total, page, limit);
  }

  /** Distinct values of one filterable column, limited to the requests the actor can see. */
  findColumnValues(query: RequestColumnValuesQueryDto, actor: AuthUserPayload) {
    const where = this.listWhere(toListScopeQuery(query), actor);
    return findColumnValues(this.requestRepo, query, {
      alias: 'request',
      map: REQUEST_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) =>
        applyListWhere(qb, alias, SalesRequest, where),
    });
  }

  async findOne(id: number, actor: AuthUserPayload): Promise<RequestDetail> {
    return this.toDetail(await this.findVisible(id, actor));
  }

  /** Reads the request through the actor's data scope: out of scope answers 404. */
  async findVisible(id: number, actor: AuthUserPayload): Promise<SalesRequest> {
    const request = await this.requestRepo.findOne({
      where: { id, isDeleted: false },
    });
    return this.dataScope.assertVisible(actor, request, REQUEST_LABEL);
  }

  async listActivities(
    id: number,
    actor: AuthUserPayload,
  ): Promise<RequestActivityView[]> {
    await this.findVisible(id, actor);
    const rows = await this.activityRepo.find({
      where: { requestId: id },
      order: { id: 'ASC' },
    });
    const names = await this.users.namesOf(rows.map((row) => row.actorId));
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId ?? null,
      actorName: row.actorId ? (names.get(row.actorId) ?? null) : null,
      fromStatus: row.fromStatus ?? null,
      toStatus: row.toStatus ?? null,
      note: row.note ?? null,
      createdAt: row.createdAt,
    }));
  }

  /** The accounts a request may be assigned to. */
  listEngineerOptions() {
    return this.users.listActiveWithRoles(REQUEST_ENGINEER_ROLE_CODES);
  }

  async create(
    dto: CreateRequestDto,
    actor: AuthUserPayload,
  ): Promise<RequestDetail> {
    // A customer the actor cannot see answers 404, so its id cannot be probed through requests.
    const customer = await this.findVisibleCustomer(dto.customerId, actor);
    await this.assertProjectAndContact(
      customer.id,
      dto.projectId,
      dto.contactId,
    );
    const title = requireText(dto.title, 'Title is required.');

    const saved = await createWithDocumentCode(
      this.dataSource,
      {
        table: REQUEST_TABLE,
        prefix: REQUEST_CODE_PREFIX,
        codeUniqueIndex: REQUEST_CODE_UNIQUE_INDEX,
        exhaustedMessage:
          'Could not allocate a request code, please try again.',
      },
      async (manager, code) => {
        // The owner is read here, under a lock, not from the earlier read: a reassignment
        // committed in between would otherwise leave this request with the old owner. Taken
        // inside each attempt, since a lost race on the code reruns this whole function.
        const ownerId = await this.crm.lockCustomerOwner(manager, customer.id);
        this.dataScope.assertVisible(
          actor,
          ownerId === null ? null : { salesOwnerId: ownerId },
          CUSTOMER_LABEL,
        );
        const repo = manager.getRepository(SalesRequest);
        const request = await repo.save(
          repo.create({
            code,
            customerId: customer.id,
            projectId: dto.projectId ?? null,
            contactId: dto.contactId ?? null,
            title,
            technicalRequirements: trimToNull(dto.technicalRequirements),
            requestedDeliveryDate: dto.requestedDeliveryDate ?? null,
            quotationDueDate: dto.quotationDueDate ?? null,
            // Always the customer's owner, never chosen on the request.
            salesOwnerId: ownerId as number,
            assignedEngineerId: null,
            status: RequestStatus.DRAFT,
            createdBy: actor.userId,
            isDeleted: false,
          }),
        );
        await recordRequestActivity(manager, {
          requestId: request.id,
          action: 'created',
          actorId: actor.userId,
          toStatus: RequestStatus.DRAFT,
        });
        return request;
      },
    );

    return this.toDetail(saved);
  }

  async update(
    id: number,
    dto: UpdateRequestDto,
    actor: AuthUserPayload,
  ): Promise<RequestDetail> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const request = await this.lockVisible(manager, id, actor);
      if (!REQUEST_EDITABLE_STATUSES.includes(request.status)) {
        throw new ConflictException(
          `A request ${request.status} can no longer be edited.`,
        );
      }

      const projectId =
        dto.projectId === undefined ? request.projectId : dto.projectId;
      const contactId =
        dto.contactId === undefined ? request.contactId : dto.contactId;
      if (dto.projectId !== undefined || dto.contactId !== undefined) {
        await this.assertProjectAndContact(
          request.customerId,
          dto.projectId,
          dto.contactId,
        );
      }

      if (dto.title !== undefined) {
        request.title = requireText(dto.title, 'Title is required.');
      }
      if (dto.technicalRequirements !== undefined) {
        request.technicalRequirements = trimToNull(dto.technicalRequirements);
      }
      if (dto.requestedDeliveryDate !== undefined) {
        request.requestedDeliveryDate = dto.requestedDeliveryDate ?? null;
      }
      if (dto.quotationDueDate !== undefined) {
        request.quotationDueDate = dto.quotationDueDate ?? null;
      }
      request.projectId = projectId ?? null;
      request.contactId = contactId ?? null;
      request.updatedBy = actor.userId;

      const updated = await manager.getRepository(SalesRequest).save(request);
      await recordRequestActivity(manager, {
        requestId: id,
        action: 'updated',
        actorId: actor.userId,
      });
      return updated;
    });

    return this.toDetail(saved);
  }

  /**
   * Gives the request to an engineer, or hands it to another one. The first assignment moves
   * a draft to `assigned`; later ones keep the status. The engineer is notified once the
   * transaction has committed, so a rolled-back assignment tells nobody.
   */
  async assign(
    id: number,
    dto: AssignRequestDto,
    actor: AuthUserPayload,
  ): Promise<RequestDetail> {
    await this.assertAssignableEngineer(dto.engineerId);

    const { request, changed } = await this.dataSource.transaction(
      async (manager) => {
        let request = await this.lockVisible(manager, id, actor);
        if (!REQUEST_ASSIGNABLE_STATUSES.includes(request.status)) {
          throw new ConflictException(
            `A request ${request.status} can no longer be assigned.`,
          );
        }
        if (request.assignedEngineerId === dto.engineerId) {
          return { request, changed: false };
        }

        const reassigned = request.assignedEngineerId != null;
        if (request.status === RequestStatus.DRAFT) {
          request = await this.statusPort.advance(
            manager,
            id,
            RequestStatus.ASSIGNED,
            { actorId: actor.userId },
          );
        }
        request.assignedEngineerId = dto.engineerId;
        request.updatedBy = actor.userId;
        const saved = await manager.getRepository(SalesRequest).save(request);

        const names = await this.users.namesOf([dto.engineerId]);
        await recordRequestActivity(manager, {
          requestId: id,
          action: reassigned ? 'reassigned' : 'assigned',
          actorId: actor.userId,
          note: names.get(dto.engineerId) ?? null,
        });
        return { request: saved, changed: true };
      },
    );

    if (changed) await this.notifyAssigned(request, actor);
    return this.toDetail(request);
  }

  /**
   * Closes a request that goes no further, for a stated reason. An open quotation is cancelled
   * in the same transaction; a confirmed one blocks the close.
   */
  cancel(
    id: number,
    dto: RequestReasonDto,
    actor: AuthUserPayload,
  ): Promise<RequestDetail> {
    return this.close(id, dto, actor, RequestStatus.CANCELLED);
  }

  /** Records that the bid went to someone else, for a stated reason. */
  markLost(
    id: number,
    dto: RequestReasonDto,
    actor: AuthUserPayload,
  ): Promise<RequestDetail> {
    return this.close(id, dto, actor, RequestStatus.LOST);
  }

  private async close(
    id: number,
    dto: RequestReasonDto,
    actor: AuthUserPayload,
    to: RequestStatus.CANCELLED | RequestStatus.LOST,
  ): Promise<RequestDetail> {
    const reason = requireText(dto.reason, 'Reason is required.');

    const closed = await this.dataSource.transaction(async (manager) => {
      const request = await this.lockVisible(manager, id, actor);
      // Closing again is a no-op: the first reason stands.
      if (request.status === to) return request;

      // Documents hanging off the request close with it, or refuse (409) and keep it open.
      await this.closeHooks.apply(manager, {
        requestId: id,
        reason,
        actorId: actor.userId,
      });
      const advanced = await this.statusPort.advance(manager, id, to, {
        actorId: actor.userId,
        note: reason,
      });
      if (to === RequestStatus.CANCELLED) advanced.cancelReason = reason;
      else advanced.lostReason = reason;
      return manager.getRepository(SalesRequest).save(advanced);
    });

    return this.toDetail(closed);
  }

  /** Locks the request for the rest of the transaction and reads it through the data scope. */
  async lockVisible(
    manager: EntityManager,
    id: number,
    actor: AuthUserPayload,
  ): Promise<SalesRequest> {
    const request = await manager.getRepository(SalesRequest).findOne({
      where: { id, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    return this.dataScope.assertVisible(actor, request, REQUEST_LABEL);
  }

  /** The engineer is told after the commit; a failed notice must not undo a committed assignment. */
  private async notifyAssigned(
    request: SalesRequest,
    actor: AuthUserPayload,
  ): Promise<void> {
    if (!request.assignedEngineerId) return;
    try {
      await this.notifications.emit({
        eventType: REQUEST_ASSIGNED_EVENT,
        roleCodes: [],
        userIds: [request.assignedEngineerId],
        // The bell phrases the event from the payload; the text is the fallback for a reader
        // whose client does not know the event.
        message: `${request.code} — ${request.title}`,
        requiredScope: REQUEST_READ,
        link: `/sales/requests/${request.id}`,
        payload: {
          requestId: request.id,
          code: request.code,
          title: request.title,
        },
        createdBy: actor.userId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not notify the engineer of request ${request.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async findVisibleCustomer(
    customerId: number,
    actor: AuthUserPayload,
  ): Promise<CustomerSummary> {
    const summary = await this.crm.getCustomerSummary(customerId);
    return this.dataScope.assertVisible(
      actor,
      summary && !summary.isDeleted ? summary : null,
      CUSTOMER_LABEL,
    );
  }

  /** A project or contact only counts when it is live and belongs to the request's customer. */
  private async assertProjectAndContact(
    customerId: number,
    projectId: number | null | undefined,
    contactId: number | null | undefined,
  ): Promise<void> {
    if (projectId != null) {
      const project = await this.crm.getProjectSummary(projectId);
      if (!project || project.isDeleted || project.customerId !== customerId) {
        throw new BadRequestException(
          'Project must be an active project of the customer.',
        );
      }
    }
    if (contactId != null) {
      const contact = await this.crm.getContactSummary(contactId);
      if (!contact || contact.isDeleted || contact.customerId !== customerId) {
        throw new BadRequestException(
          'Contact must be an active contact of the customer.',
        );
      }
    }
  }

  private async assertAssignableEngineer(engineerId: number): Promise<void> {
    const eligible = await this.users.hasActiveRole(
      engineerId,
      REQUEST_ENGINEER_ROLE_CODES,
    );
    if (!eligible) {
      throw new BadRequestException(
        'Engineer must be an active engineer or engineering lead.',
      );
    }
  }

  private async toListItems(rows: SalesRequest[]): Promise<RequestListItem[]> {
    const [customers, names] = await Promise.all([
      this.crm.getCustomerSummaries(rows.map((row) => row.customerId)),
      this.users.namesOf(
        rows.flatMap((row) => [row.salesOwnerId, row.assignedEngineerId]),
      ),
    ]);
    return rows.map((row) =>
      Object.assign(row, {
        customerCode: customers.get(row.customerId)?.code ?? null,
        customerName: customers.get(row.customerId)?.name ?? null,
        salesOwnerName: names.get(row.salesOwnerId) ?? null,
        assignedEngineerName: row.assignedEngineerId
          ? (names.get(row.assignedEngineerId) ?? null)
          : null,
      }),
    );
  }

  private async toDetail(request: SalesRequest): Promise<RequestDetail> {
    const [customer, project, contact, names] = await Promise.all([
      this.crm.getCustomerSummary(request.customerId),
      request.projectId ? this.crm.getProjectSummary(request.projectId) : null,
      request.contactId ? this.crm.getContactSummary(request.contactId) : null,
      this.users.namesOf([request.salesOwnerId, request.assignedEngineerId]),
    ]);

    return Object.assign(request, {
      salesOwnerName: names.get(request.salesOwnerId) ?? null,
      assignedEngineerName: request.assignedEngineerId
        ? (names.get(request.assignedEngineerId) ?? null)
        : null,
      customer: customer && {
        id: customer.id,
        code: customer.code,
        name: customer.name,
        taxCode: customer.taxCode,
        address: customer.address,
      },
      project: project && {
        id: project.id,
        code: project.code,
        name: project.name,
        siteAddress: project.siteAddress,
      },
      contact: contact && {
        id: contact.id,
        name: contact.name,
        position: contact.position,
        phone: contact.phone,
        email: contact.email,
      },
    });
  }
}
