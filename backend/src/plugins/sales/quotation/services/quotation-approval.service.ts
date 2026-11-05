import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { DataScopeService } from '@shared/services/data-scope.service';

import { EstimateReadPort } from '@plugins/sales/_shared/ports/estimate-read.port';
import {
  RequestCloseRegistry,
  type RequestClose,
} from '@plugins/sales/_shared/ports/request-close-registry';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { requireText } from '@plugins/sales/_shared/utils/text.util';
import {
  QUOTATION_APPROVED_EVENT,
  QUOTATION_APPROVER_ROLE_CODES,
  QUOTATION_REJECTED_EVENT,
  QUOTATION_SUBMIT_ANY_ROLE_CODES,
  QUOTATION_SUBMITTED_EVENT,
} from '@plugins/sales/quotation/constants/quotation.constant';
import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import {
  QUOTATION_OPEN_STATUSES,
  QuotationVersionStatus,
} from '@plugins/sales/quotation/enums/quotation-version-status.enum';
import {
  QUOTATION_APPROVE,
  QUOTATION_READ,
} from '@plugins/sales/quotation/permissions/quotation.permissions';
import {
  QuotationService,
  type QuotationDetail,
} from '@plugins/sales/quotation/services/quotation.service';
import {
  lockQuotation,
  type LockedQuotation,
} from '@plugins/sales/quotation/utils/quotation-lock.util';
import { RequestReasonDto } from '@plugins/sales/request/dto/request-reason.dto';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** Name the quotation registers under at the request-close hook. */
const REQUEST_CLOSE_HOOK_NAME = 'quotation';

/** The director decides alone, so a version they submit is approved at once. */
const SELF_APPROVING_ROLE = 'director';

/** Told, besides the sales owner, that a version was approved. */
const QUOTATION_APPROVED_BROADCAST_ROLE_CODES = ['salesManager'];

/**
 * The quotation's decisions: hand in for approval, approve or reject, the customer's answer
 * (confirm) and cancel. Each runs in one transaction that takes the request row and then the
 * header `FOR UPDATE` (see `lockQuotation`) and moves the version with
 * `UPDATE … WHERE status = :expected`, so two writers on one version never both act on the
 * status they read, and a version is never both closed and confirmed.
 */
@Injectable()
export class QuotationApprovalService implements OnModuleInit {
  private readonly logger = new Logger(QuotationApprovalService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly quotations: QuotationService,
    private readonly estimates: EstimateReadPort,
    private readonly statusPort: RequestStatusPort,
    private readonly notifications: NotificationService,
    private readonly closeHooks: RequestCloseRegistry,
  ) {}

  /** Closing the request from its own page cancels an open quotation with it, or refuses. */
  onModuleInit(): void {
    this.closeHooks.register(REQUEST_CLOSE_HOOK_NAME, (manager, close) =>
      this.cancelWithRequest(manager, close),
    );
  }

  /**
   * Hands the draft in. Only its creator, or a manager, may; a draft built on an estimate
   * revision that is no longer the latest submitted one is refused until it is refreshed.
   * The approvers are told after the commit, once; a director's submission is approved in the
   * same transaction and only the approval is announced.
   */
  async submit(id: number, actor: AuthUserPayload): Promise<QuotationDetail> {
    const locked = await this.dataSource.transaction(async (manager) => {
      const held = await lockQuotation(manager, this.dataScope, id, actor);
      const { quotation, request, version } = held;
      if (
        version.createdBy !== actor.userId &&
        !QUOTATION_SUBMIT_ANY_ROLE_CODES.some((role) => role === actor.role)
      ) {
        throw new ForbiddenException(
          'Only the version creator or a manager can submit it for approval.',
        );
      }
      this.assertStatus(version, [QuotationVersionStatus.DRAFT], 'submitted');

      const latest = await this.estimates.getLatestSubmitted(
        manager,
        request.id,
      );
      if (latest?.revisionId !== version.estimateRevisionId) {
        throw new ConflictException(
          'The estimate was revised after this draft was built; update the quotation from the latest estimate before submitting.',
        );
      }

      const selfApproved = actor.role === SELF_APPROVING_ROLE;
      await this.move(
        manager,
        version,
        QuotationVersionStatus.DRAFT,
        selfApproved
          ? QuotationVersionStatus.APPROVED
          : QuotationVersionStatus.PENDING_APPROVAL,
        selfApproved ? this.decision(actor) : {},
      );
      if (selfApproved) {
        await this.statusPort.advance(
          manager,
          request.id,
          RequestStatus.QUOTED,
          { actorId: actor.userId, note: quotation.code },
        );
      }
      await this.touch(manager, quotation, actor, request, {
        action: 'quotation_submitted',
      });
      if (selfApproved) {
        await this.touch(manager, quotation, actor, request, {
          action: 'quotation_approved',
        });
      }
      return { ...held, selfApproved };
    });

    if (locked.selfApproved) {
      await this.notifyApproved(locked, actor);
    } else {
      await this.notify(QUOTATION_SUBMITTED_EVENT, locked, actor, {
        roleCodes: [...QUOTATION_APPROVER_ROLE_CODES],
        requiredScope: QUOTATION_APPROVE,
      });
    }
    return this.quotations.findOne(id, actor);
  }

  /**
   * One approval step. The approver is never the version's creator or last editor, unless
   * they are the director. The first approval moves the request from `estimated` to `quoted`
   * in the same transaction; a revised version approved later finds it already there. The
   * sales owner and the sales managers are told after the commit.
   */
  async approve(id: number, actor: AuthUserPayload): Promise<QuotationDetail> {
    const locked = await this.dataSource.transaction(async (manager) => {
      const held = await lockQuotation(manager, this.dataScope, id, actor);
      const { quotation, request, version } = held;
      this.assertApprover(version, actor);
      this.assertStatus(
        version,
        [QuotationVersionStatus.PENDING_APPROVAL],
        'approved',
      );

      await this.move(
        manager,
        version,
        QuotationVersionStatus.PENDING_APPROVAL,
        QuotationVersionStatus.APPROVED,
        this.decision(actor),
      );
      await this.statusPort.advance(manager, request.id, RequestStatus.QUOTED, {
        actorId: actor.userId,
        note: quotation.code,
      });
      await this.touch(manager, quotation, actor, request, {
        action: 'quotation_approved',
      });
      return held;
    });

    await this.notifyApproved(locked, actor);
    return this.quotations.findOne(id, actor);
  }

  /** Sends the version back for a stated reason; Sales revises it into the next version. */
  async reject(
    id: number,
    dto: RequestReasonDto,
    actor: AuthUserPayload,
  ): Promise<QuotationDetail> {
    const reason = requireText(dto.reason, 'Reason is required.');
    const locked = await this.dataSource.transaction(async (manager) => {
      const held = await lockQuotation(manager, this.dataScope, id, actor);
      const { quotation, request, version } = held;
      this.assertApprover(version, actor);
      this.assertStatus(
        version,
        [QuotationVersionStatus.PENDING_APPROVAL],
        'rejected',
      );

      await this.move(
        manager,
        version,
        QuotationVersionStatus.PENDING_APPROVAL,
        QuotationVersionStatus.REJECTED,
        {
          decidedBy: actor.userId,
          decidedAt: new Date(),
          decisionReason: reason,
        },
      );
      await this.touch(manager, quotation, actor, request, {
        action: 'quotation_rejected',
        note: reason,
      });
      return { ...held, reason };
    });

    await this.notify(QUOTATION_REJECTED_EVENT, locked, actor, {
      userIds: [locked.request.salesOwnerId],
      requiredScope: QUOTATION_READ,
      extra: { reason: locked.reason },
    });
    return this.quotations.findOne(id, actor);
  }

  /** The customer accepted: only an approved version can be confirmed. */
  async confirm(id: number, actor: AuthUserPayload): Promise<QuotationDetail> {
    await this.dataSource.transaction(async (manager) => {
      const { quotation, request, version } = await lockQuotation(
        manager,
        this.dataScope,
        id,
        actor,
      );
      this.assertStatus(
        version,
        [QuotationVersionStatus.APPROVED],
        'confirmed',
      );
      await this.move(
        manager,
        version,
        QuotationVersionStatus.APPROVED,
        QuotationVersionStatus.CUSTOMER_CONFIRMED,
      );
      await this.touch(manager, quotation, actor, request, {
        action: 'quotation_confirmed',
      });
    });
    return this.quotations.findOne(id, actor);
  }

  /**
   * Ends the quotation for a stated reason, and with it the request: the customer is lost. A
   * returning customer gets a new request; a quotation never restarts. A confirmed or already
   * cancelled version cannot be cancelled.
   */
  async cancel(
    id: number,
    dto: RequestReasonDto,
    actor: AuthUserPayload,
  ): Promise<QuotationDetail> {
    const reason = requireText(dto.reason, 'Reason is required.');
    await this.dataSource.transaction(async (manager) => {
      const { quotation, request, version } = await lockQuotation(
        manager,
        this.dataScope,
        id,
        actor,
      );
      this.assertStatus(version, QUOTATION_OPEN_STATUSES, 'cancelled');
      // Losing a won request is the order's cancellation alone.
      if (request.status === RequestStatus.WON) {
        throw new ConflictException(
          'A won request can only be ended by cancelling its order.',
        );
      }

      await this.cancelVersion(manager, quotation, version, {
        reason,
        actorId: actor.userId,
      });
      const lost = await this.statusPort.advance(
        manager,
        request.id,
        RequestStatus.LOST,
        { actorId: actor.userId, note: reason },
      );
      lost.lostReason = reason;
      await manager.getRepository(SalesRequest).save(lost);
    });
    return this.quotations.findOne(id, actor);
  }

  /**
   * The request-close hook: runs inside the request's transaction, which already holds the
   * request row. An open version is cancelled with the request's reason; a confirmed one
   * blocks the close with 409; no quotation, or one already cancelled, is nothing to do.
   */
  private async cancelWithRequest(
    manager: EntityManager,
    close: RequestClose,
  ): Promise<void> {
    const quotation = await manager.getRepository(Quotation).findOne({
      where: { requestId: close.requestId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!quotation) return;
    const version = await manager.getRepository(QuotationVersion).findOne({
      where: { quotationId: quotation.id, ver: quotation.latestVer },
    });
    if (!version) return;

    if (version.status === QuotationVersionStatus.CUSTOMER_CONFIRMED) {
      throw new ConflictException(
        `Quotation ${quotation.code} is confirmed by the customer, so its request cannot be closed.`,
      );
    }
    if (!QUOTATION_OPEN_STATUSES.includes(version.status)) return;
    await this.cancelVersion(manager, quotation, version, close);
  }

  private async cancelVersion(
    manager: EntityManager,
    quotation: Quotation,
    version: QuotationVersion,
    close: { reason: string; actorId: number },
  ): Promise<void> {
    await this.move(
      manager,
      version,
      version.status,
      QuotationVersionStatus.CANCELLED,
      {
        decidedBy: close.actorId,
        decidedAt: new Date(),
        decisionReason: close.reason,
      },
    );
    quotation.updatedBy = close.actorId;
    await manager.getRepository(Quotation).save(quotation);
    await recordRequestActivity(manager, {
      requestId: quotation.requestId,
      action: 'quotation_cancelled',
      actorId: close.actorId,
      note: `${quotation.code} #${version.ver}: ${close.reason}`,
    });
  }

  /** Moves the version only if it still has the status this transaction read under the lock. */
  private async move(
    manager: EntityManager,
    version: QuotationVersion,
    from: QuotationVersionStatus,
    to: QuotationVersionStatus,
    patch: Partial<QuotationVersion> = {},
  ): Promise<void> {
    const result = await manager
      .getRepository(QuotationVersion)
      .update({ id: version.id, status: from }, { ...patch, status: to });
    if (result.affected !== 1) {
      throw new ConflictException(
        `Version ${version.ver} changed while it was being moved to ${to}.`,
      );
    }
  }

  private async touch(
    manager: EntityManager,
    quotation: Quotation,
    actor: AuthUserPayload,
    request: SalesRequest,
    activity: { action: string; note?: string },
  ): Promise<void> {
    quotation.updatedBy = actor.userId;
    await manager.getRepository(Quotation).save(quotation);
    await recordRequestActivity(manager, {
      requestId: request.id,
      action: activity.action,
      actorId: actor.userId,
      note: activity.note ?? quotation.code,
    });
  }

  private assertStatus(
    version: QuotationVersion,
    allowed: readonly QuotationVersionStatus[],
    action: string,
  ): void {
    if (!allowed.includes(version.status)) {
      throw new ConflictException(
        `Version ${version.ver} is ${version.status} and cannot be ${action}.`,
      );
    }
  }

  private decision(actor: AuthUserPayload): Partial<QuotationVersion> {
    return {
      decidedBy: actor.userId,
      decidedAt: new Date(),
      decisionReason: null,
    };
  }

  /**
   * Four-eyes: nobody decides on a version they created or last edited themselves, except the
   * director, who also approves their own submissions.
   */
  private assertApprover(
    version: QuotationVersion,
    actor: AuthUserPayload,
  ): void {
    if (actor.role === SELF_APPROVING_ROLE) return;
    if (
      version.createdBy === actor.userId ||
      version.lastEditedBy === actor.userId
    ) {
      throw new ForbiddenException(
        'The creator or the last editor of a version cannot approve or reject it.',
      );
    }
  }

  /** The sales owner and the sales managers hear of an approval, never the approver. */
  private async notifyApproved(
    locked: LockedQuotation,
    actor: AuthUserPayload,
  ): Promise<void> {
    const { salesOwnerId } = locked.request;
    await this.notify(QUOTATION_APPROVED_EVENT, locked, actor, {
      userIds: [salesOwnerId],
      requiredScope: QUOTATION_READ,
    });
    await this.notify(QUOTATION_APPROVED_EVENT, locked, actor, {
      roleCodes: QUOTATION_APPROVED_BROADCAST_ROLE_CODES,
      excludeUserIds: [actor.userId, salesOwnerId],
      requiredScope: QUOTATION_READ,
    });
  }

  /** After the commit; a failed notice must not undo a committed decision. */
  private async notify(
    eventType: string,
    { quotation, request, version }: LockedQuotation,
    actor: AuthUserPayload,
    target: {
      roleCodes?: string[];
      userIds?: number[];
      excludeUserIds?: number[];
      requiredScope: string;
      extra?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.notifications.emit({
        eventType,
        roleCodes: target.roleCodes ?? [],
        userIds: target.userIds ?? [],
        excludeUserIds: target.excludeUserIds,
        // The bell phrases the event from the payload; the text is the fallback for a reader
        // whose client does not know the event.
        message: `${quotation.code} — ${request.code}`,
        requiredScope: target.requiredScope,
        link: `/sales/quotations/${quotation.id}`,
        payload: {
          quotationId: quotation.id,
          code: quotation.code,
          ver: version.ver,
          requestId: request.id,
          requestCode: request.code,
          ...target.extra,
        },
        createdBy: actor.userId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not send the ${eventType} notice of quotation ${quotation.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
