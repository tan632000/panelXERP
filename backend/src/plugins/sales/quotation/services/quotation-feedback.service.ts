import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { CreateQuotationFeedbackDto } from '@plugins/sales/quotation/dto/create-quotation-feedback.dto';
import { QuotationFeedback } from '@plugins/sales/quotation/entities/quotation-feedback.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { lockQuotation } from '@plugins/sales/quotation/utils/quotation-lock.util';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

const QUOTATION_LABEL = 'Quotation';

export type QuotationFeedbackView = QuotationFeedback & {
  createdByName: string | null;
};

/**
 * The log of what the customer answered, newest first. Append-only: an entry is never edited,
 * so the history of the negotiation stays as it was told. Reads and writes follow the
 * quotation's data scope.
 */
@Injectable()
export class QuotationFeedbackService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly users: SalesUserLookup,
  ) {}

  async list(
    quotationId: number,
    actor: AuthUserPayload,
  ): Promise<QuotationFeedbackView[]> {
    const manager = this.dataSource.manager;
    await this.assertVisible(manager, quotationId, actor);
    const rows = await manager.getRepository(QuotationFeedback).find({
      where: { quotationId },
      order: { feedbackDate: 'DESC', id: 'DESC' },
    });
    const names = await this.users.namesOf(rows.map((row) => row.createdBy));
    return rows.map((row) =>
      Object.assign(row, {
        createdByName: row.createdBy
          ? (names.get(row.createdBy) ?? null)
          : null,
      }),
    );
  }

  async add(
    quotationId: number,
    dto: CreateQuotationFeedbackDto,
    actor: AuthUserPayload,
  ): Promise<QuotationFeedbackView> {
    const saved = await this.dataSource.transaction(async (manager) => {
      // Request first, then header: the order every quotation write and the request close
      // follow. Inserting the entry first would take the header, then wait on the request.
      const { quotation, request } = await lockQuotation(
        manager,
        this.dataScope,
        quotationId,
        actor,
      );
      const repo = manager.getRepository(QuotationFeedback);
      const entry = await repo.save(
        repo.create({
          quotationId: quotation.id,
          feedbackDate: dto.feedbackDate,
          channel: dto.channel,
          content: dto.content,
          createdBy: actor.userId,
        }),
      );
      await recordRequestActivity(manager, {
        requestId: request.id,
        action: 'quotation_feedback_added',
        actorId: actor.userId,
        note: `${quotation.code} (${dto.channel})`,
      });
      return entry;
    });

    const names = await this.users.namesOf([saved.createdBy]);
    return Object.assign(saved, {
      createdByName: names.get(actor.userId) ?? null,
    });
  }

  /** 404 for an unknown quotation or one outside the actor's data scope. */
  private async assertVisible(
    manager: EntityManager,
    quotationId: number,
    actor: AuthUserPayload,
  ): Promise<{ quotation: Quotation; request: SalesRequest }> {
    const quotation = await manager.getRepository(Quotation).findOne({
      where: { id: quotationId, isDeleted: false },
    });
    if (!quotation) throw new NotFoundException(`${QUOTATION_LABEL} not found`);
    const request = this.dataScope.assertVisible(
      actor,
      await manager.getRepository(SalesRequest).findOne({
        where: { id: quotation.requestId, isDeleted: false },
      }),
      QUOTATION_LABEL,
    );
    return { quotation, request };
  }
}
