import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { MAX_DISCOUNT_PERCENT } from '@plugins/sales/quotation/constants/quotation.constant';
import { UpdateQuotationPricingDto } from '@plugins/sales/quotation/dto/update-quotation-pricing.dto';
import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';
import {
  QUOTATION_REVISABLE_STATUSES,
  QuotationVersionStatus,
} from '@plugins/sales/quotation/enums/quotation-version-status.enum';
import {
  QuotationService,
  type QuotationDetail,
} from '@plugins/sales/quotation/services/quotation.service';
import {
  copyVersionTree,
  loadVersionTree,
  recalculateVersion,
} from '@plugins/sales/quotation/utils/quotation-version.util';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

const QUOTATION_LABEL = 'Quotation';

/** What a write works on: the locked header, its request and its newest version. */
interface LockedQuotation {
  quotation: Quotation;
  request: SalesRequest;
  version: QuotationVersion;
}

/**
 * Changes to a quotation's versions: pricing edits of the draft and revisions. Each runs in one
 * transaction that holds the header row `FOR UPDATE`, so concurrent edits and revises of one
 * quotation run one after another and none acts on a status it read before.
 */
@Injectable()
export class QuotationVersionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly quotations: QuotationService,
  ) {}

  /**
   * Sets margins per line, the discount and the VAT rate of the draft version; only what the
   * body names changes. Every total is recomputed by the server from the stored figures.
   */
  async updatePricing(
    id: number,
    dto: UpdateQuotationPricingDto,
    actor: AuthUserPayload,
  ): Promise<QuotationDetail> {
    await this.dataSource.transaction(async (manager) => {
      const { quotation, version } = await this.lockForWrite(
        manager,
        id,
        actor,
      );
      this.assertDraft(version);
      const tree = await loadVersionTree(manager, version.id);

      const seen = new Set<number>();
      for (const { lineId, marginPercent } of dto.lines ?? []) {
        const entry = tree.lines.find(({ line }) => line.id === lineId);
        if (!entry || seen.has(lineId)) {
          throw new BadRequestException(
            `Line ${lineId} is not a line of this version, or is listed twice.`,
          );
        }
        seen.add(lineId);
        entry.line.marginPercent = marginPercent;
      }
      if (dto.discountType !== undefined) {
        version.discountType = dto.discountType;
      }
      if (dto.discountValue !== undefined) {
        version.discountValue = dto.discountValue;
      }
      if (dto.vatRate !== undefined) version.vatRate = dto.vatRate;
      if (
        version.discountType === DiscountType.PERCENT &&
        version.discountValue > MAX_DISCOUNT_PERCENT
      ) {
        throw new BadRequestException(
          `A percent discount must not exceed ${MAX_DISCOUNT_PERCENT}.`,
        );
      }

      await recalculateVersion(manager, version, tree);
      quotation.updatedBy = actor.userId;
      await manager.getRepository(Quotation).save(quotation);
    });

    return this.quotations.findOne(id, actor);
  }

  /**
   * Opens version N+1 as a draft copying the newest version's lines, frozen BOM and pricing,
   * and closes version N. Possible only from `pending_approval`, `approved` or `rejected`: a
   * draft is edited instead, and a confirmed, cancelled or closed version is final. The close
   * is `WHERE status = :expected`, so a version that moved after it was read is not revised
   * from stale ground.
   */
  async revise(id: number, actor: AuthUserPayload): Promise<QuotationDetail> {
    await this.dataSource.transaction(async (manager) => {
      const { quotation, request, version } = await this.lockForWrite(
        manager,
        id,
        actor,
      );
      if (!QUOTATION_REVISABLE_STATUSES.includes(version.status)) {
        throw new ConflictException(
          `Version ${version.ver} is ${version.status} and cannot be revised; only pending_approval, approved or rejected versions can.`,
        );
      }

      const versionRepo = manager.getRepository(QuotationVersion);
      // Closed first: at most one version per quotation may be open.
      const closed = await versionRepo.update(
        { id: version.id, status: version.status },
        { status: QuotationVersionStatus.CLOSED },
      );
      if (closed.affected !== 1) {
        throw new ConflictException(
          `Version ${version.ver} changed while it was being revised.`,
        );
      }

      const tree = await loadVersionTree(manager, version.id);
      const next = await versionRepo.save(
        versionRepo.create({
          quotationId: quotation.id,
          ver: version.ver + 1,
          status: QuotationVersionStatus.DRAFT,
          estimateRevisionId: version.estimateRevisionId,
          estimateRevision: version.estimateRevision,
          discountType: version.discountType,
          discountValue: version.discountValue,
          vatRate: version.vatRate,
          subtotal: version.subtotal,
          discountAmount: version.discountAmount,
          taxable: version.taxable,
          vatAmount: version.vatAmount,
          total: version.total,
          createdBy: actor.userId,
        }),
      );
      await copyVersionTree(manager, tree, next.id);

      quotation.latestVer = next.ver;
      quotation.updatedBy = actor.userId;
      await manager.getRepository(Quotation).save(quotation);
      await recordRequestActivity(manager, {
        requestId: request.id,
        action: 'quotation_revised',
        actorId: actor.userId,
        note: `${quotation.code} #${next.ver}`,
      });
    });

    return this.quotations.findOne(id, actor);
  }

  /**
   * Locks the quotation header for the rest of the transaction, checks the actor's data scope
   * reaches its request (404 otherwise) and reads the newest version under that lock.
   */
  private async lockForWrite(
    manager: EntityManager,
    id: number,
    actor: AuthUserPayload,
  ): Promise<LockedQuotation> {
    const quotation = await manager.getRepository(Quotation).findOne({
      where: { id, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!quotation) throw new NotFoundException(`${QUOTATION_LABEL} not found`);
    const request = this.dataScope.assertVisible(
      actor,
      await manager.getRepository(SalesRequest).findOne({
        where: { id: quotation.requestId, isDeleted: false },
      }),
      QUOTATION_LABEL,
    );
    const version = await manager.getRepository(QuotationVersion).findOne({
      where: { quotationId: quotation.id, ver: quotation.latestVer },
    });
    if (!version) throw new NotFoundException('Version not found');
    return { quotation, request, version };
  }

  /** Only a draft version is editable; the others are read-only. */
  private assertDraft(version: QuotationVersion): void {
    if (version.status !== QuotationVersionStatus.DRAFT) {
      throw new ConflictException(
        `Version ${version.ver} is ${version.status} and read-only; revise the quotation to change it.`,
      );
    }
  }
}
