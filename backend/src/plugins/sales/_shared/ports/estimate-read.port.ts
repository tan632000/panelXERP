import { Injectable } from '@nestjs/common';

import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';
import {
  loadRevisionView,
  type EstimatePanelView,
} from '@plugins/sales/estimate/utils/estimate-revision.util';

import type { EntityManager } from 'typeorm';

/** The submitted estimate of a request, frozen as it was handed in. */
export interface SubmittedEstimate {
  estimateId: number;
  code: string;
  requestId: number;
  revisionId: number;
  revision: number;
  /** Σ panel totals, VND. */
  total: number;
  submittedAt: Date | null;
  /** Panels with totals, BOM lines (item snapshots) and cost lines. */
  panels: EstimatePanelView[];
}

export interface GetLatestSubmittedOptions {
  /**
   * Holds the estimate row `FOR SHARE` until the caller's transaction ends, so a submit or
   * revise of that estimate (which takes it `FOR UPDATE`) waits instead of replacing the
   * revision the caller is about to build on. Take it BEFORE locking the request: the estimate
   * paths lock estimate then request, and the reverse order deadlocks.
   */
  lock?: boolean;
}

/**
 * How the quotation reads an estimate without knowing its tables: read-only, on the caller's
 * manager so it sees the same snapshot as the rest of the caller's transaction.
 */
@Injectable()
export class EstimateReadPort {
  /**
   * The revision of the request's estimate that is currently submitted and priced, or `null`
   * when the request has none yet (never estimated, only a draft so far, or submitted but not
   * priced by sales). A draft or an unpriced revision never shows here, so a quotation cannot be
   * built on figures still being edited or still missing their costs.
   */
  async getLatestSubmitted(
    manager: EntityManager,
    requestId: number,
    options: GetLatestSubmittedOptions = {},
  ): Promise<SubmittedEstimate | null> {
    const estimate = await manager.getRepository(Estimate).findOne({
      where: { requestId, isDeleted: false },
      ...(options.lock ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    if (!estimate) return null;

    const revision = await manager.getRepository(EstimateRevision).findOne({
      where: {
        estimateId: estimate.id,
        status: EstimateRevisionStatus.SUBMITTED,
      },
    });
    if (!revision?.pricedAt) return null;

    const view = await loadRevisionView(manager, revision);
    return {
      estimateId: estimate.id,
      code: estimate.code,
      requestId,
      revisionId: revision.id,
      revision: revision.revision,
      total: view.total,
      submittedAt: view.submittedAt,
      panels: view.panels,
    };
  }
}
