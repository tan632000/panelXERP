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

/**
 * How the quotation reads an estimate without knowing its tables: read-only, on the caller's
 * manager so it sees the same snapshot as the rest of the caller's transaction.
 */
@Injectable()
export class EstimateReadPort {
  /**
   * The revision of the request's estimate that is currently submitted, or `null` when the
   * request has none yet (never estimated, or only a draft so far). A draft never shows here,
   * so a quotation cannot be built on figures still being edited.
   */
  async getLatestSubmitted(
    manager: EntityManager,
    requestId: number,
  ): Promise<SubmittedEstimate | null> {
    const estimate = await manager
      .getRepository(Estimate)
      .findOne({ where: { requestId, isDeleted: false } });
    if (!estimate) return null;

    const revision = await manager.getRepository(EstimateRevision).findOne({
      where: {
        estimateId: estimate.id,
        status: EstimateRevisionStatus.SUBMITTED,
      },
    });
    if (!revision) return null;

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
