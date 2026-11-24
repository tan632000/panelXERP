import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { presentRevision } from '@plugins/sales/estimate/utils/estimate-price-visibility.util';
import {
  lineOfRevision,
  loadRevisionTree,
  loadRevisionView,
  type EstimateRevisionView,
} from '@plugins/sales/estimate/utils/estimate-revision.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/**
 * The engineer's check of the lines an AI run chose. It takes the same locks and refuses the same
 * actors and states as an edit of the draft, but changes no figure, so nothing is recomputed. Only
 * an AI line can be verified: verifying a manual line changes nothing. Idempotent.
 */
@Injectable()
export class EstimateVerifyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly estimates: EstimateService,
  ) {}

  verifyBomLine(
    estimateId: number,
    lineId: number,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.verify(estimateId, actor, async (manager, revision) => {
      const repo = manager.getRepository(EstimateBomLine);
      const line = await lineOfRevision(manager, revision.id, repo, lineId);
      await this.markVerified(manager, [line]);
    });
  }

  verifyAll(
    estimateId: number,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.verify(estimateId, actor, async (manager, revision) => {
      const tree = await loadRevisionTree(manager, revision.id);
      await this.markVerified(
        manager,
        tree.panels.flatMap(({ bomLines }) => bomLines),
      );
    });
  }

  private verify(
    estimateId: number,
    actor: AuthUserPayload,
    work: (manager: EntityManager, revision: EstimateRevision) => Promise<void>,
  ): Promise<EstimateRevisionView> {
    return this.dataSource.transaction(async (manager) => {
      const { estimate, request } = await this.estimates.lockForWrite(
        manager,
        estimateId,
        actor,
      );
      const revision = await this.estimates.latestRevisionOf(manager, estimate);
      this.estimates.assertDraft(revision);
      this.estimates.assertRequestEstimatable(request, 'edited');

      await work(manager, revision);

      return presentRevision(await loadRevisionView(manager, revision), actor);
    });
  }

  private async markVerified(
    manager: EntityManager,
    lines: EstimateBomLine[],
  ): Promise<void> {
    const repo = manager.getRepository(EstimateBomLine);
    for (const line of lines) {
      if (!line.isAiGenerated || line.isVerified) continue;
      line.isVerified = true;
      await repo.save(line);
    }
  }
}
