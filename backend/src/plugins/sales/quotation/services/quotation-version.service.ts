import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { EstimateReadPort } from '@plugins/sales/_shared/ports/estimate-read.port';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { MAX_DISCOUNT_PERCENT } from '@plugins/sales/quotation/constants/quotation.constant';
import { UpdateQuotationPricingDto } from '@plugins/sales/quotation/dto/update-quotation-pricing.dto';
import { QuotationLine } from '@plugins/sales/quotation/entities/quotation-line.entity';
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
import { lockQuotation } from '@plugins/sales/quotation/utils/quotation-lock.util';
import {
  copyVersionTree,
  loadVersionTree,
  recalculateVersion,
  snapshotEstimatePanels,
} from '@plugins/sales/quotation/utils/quotation-version.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * Changes to a quotation's versions: pricing edits of the draft and revisions. Each runs in one
 * transaction that holds the request and then the header row `FOR UPDATE`, so concurrent edits and revises of one
 * quotation run one after another and none acts on a status it read before.
 */
@Injectable()
export class QuotationVersionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly quotations: QuotationService,
    private readonly estimates: EstimateReadPort,
  ) {}

  /**
   * Sets margins per line, the discount, the VAT rate and the printed terms of the draft
   * version; only what the body names changes. Every total is recomputed by the server from the stored figures.
   */
  async updatePricing(
    id: number,
    dto: UpdateQuotationPricingDto,
    actor: AuthUserPayload,
  ): Promise<QuotationDetail> {
    await this.dataSource.transaction(async (manager) => {
      const { quotation, version } = await lockQuotation(
        manager,
        this.dataScope,
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
      if (dto.terms !== undefined) version.terms = dto.terms;
      version.lastEditedBy = actor.userId;
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
      const { quotation, request, version } = await lockQuotation(
        manager,
        this.dataScope,
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
          terms: version.terms,
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
   * Rebuilds the draft's panel lines and frozen BOM from the latest submitted estimate
   * revision, keeping the margin of every panel whose tag still exists (a new panel starts at
   * 0). Discount, VAT and terms stay. A draft already on the latest revision is left as is.
   */
  async refreshEstimate(
    id: number,
    actor: AuthUserPayload,
  ): Promise<QuotationDetail> {
    await this.dataSource.transaction(async (manager) => {
      const { quotation, request, version } = await lockQuotation(
        manager,
        this.dataScope,
        id,
        actor,
      );
      this.assertDraft(version);

      const latest = await this.estimates.getLatestSubmitted(
        manager,
        request.id,
      );
      if (!latest) {
        throw new ConflictException(
          'The request has no submitted estimate to quote.',
        );
      }
      if (latest.revisionId === version.estimateRevisionId) return;

      const margins = new Map(
        (await loadVersionTree(manager, version.id)).lines.map(({ line }) => [
          line.tag,
          line.marginPercent,
        ]),
      );
      // The BOM and cost-line copies go with their lines (cascade).
      await manager
        .getRepository(QuotationLine)
        .delete({ versionId: version.id });
      const tree = await snapshotEstimatePanels(
        manager,
        version.id,
        latest.panels,
      );
      for (const { line } of tree.lines) {
        line.marginPercent = margins.get(line.tag) ?? 0;
      }
      version.estimateRevisionId = latest.revisionId;
      version.estimateRevision = latest.revision;
      version.lastEditedBy = actor.userId;
      await recalculateVersion(manager, version, tree);

      quotation.updatedBy = actor.userId;
      await manager.getRepository(Quotation).save(quotation);
      await recordRequestActivity(manager, {
        requestId: request.id,
        action: 'quotation_estimate_refreshed',
        actorId: actor.userId,
        note: `${quotation.code} #${version.ver} ← ${latest.code} #${latest.revision}`,
      });
    });

    return this.quotations.findOne(id, actor);
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
