import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { trimToNull } from '@plugins/sales/_shared/utils/text.util';
import {
  CreateCostLineDto,
  UpdateCostLineDto,
} from '@plugins/sales/estimate/dto/cost-line.dto';
import { PriceBomLineDto } from '@plugins/sales/estimate/dto/price-bom-line.dto';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { presentRevision } from '@plugins/sales/estimate/utils/estimate-price-visibility.util';
import {
  lineOfRevision,
  loadRevisionTree,
  panelOfRevision,
  recalculateRevision,
  type EstimateRevisionView,
} from '@plugins/sales/estimate/utils/estimate-revision.util';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

const ESTIMATE_LABEL = 'Estimate';

/** What a pricing step works on: the manager of its transaction and the revision awaiting pricing. */
interface PricingContext {
  manager: EntityManager;
  revision: EstimateRevision;
}

/**
 * The pricing step of a submitted estimate: sales fills the unit cost of every BOM line and the
 * cost lines of every panel, then marks the revision priced, which is what lets a quotation be
 * built on it. The permission (`estimate:price`) is checked by the controller; here the request
 * must be inside the actor's data scope (a sales user prices their own requests only).
 *
 * Every step runs in one transaction that locks the estimate, then its request (the order every
 * estimate write takes), accepts only the latest revision while it is submitted, unpriced and
 * its request is estimated, and ends by recomputing every figure on the server.
 */
@Injectable()
export class EstimatePricingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly estimates: EstimateService,
    private readonly dataScope: DataScopeService,
  ) {}

  setUnitCost(
    id: number,
    lineId: number,
    dto: PriceBomLineDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.price(id, actor, async ({ manager, revision }) => {
      const repo = manager.getRepository(EstimateBomLine);
      const line = await lineOfRevision(manager, revision.id, repo, lineId);
      line.unitCost = dto.unitCost;
      await repo.save(line);
    });
  }

  addCostLine(
    id: number,
    panelId: number,
    dto: CreateCostLineDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.price(id, actor, async ({ manager, revision }) => {
      const panel = await panelOfRevision(manager, revision.id, panelId);
      const repo = manager.getRepository(EstimateCostLine);
      await repo.save(
        repo.create({
          panelId: panel.id,
          category: dto.category,
          description: trimToNull(dto.description),
          amount: dto.amount,
        }),
      );
    });
  }

  updateCostLine(
    id: number,
    lineId: number,
    dto: UpdateCostLineDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.price(id, actor, async ({ manager, revision }) => {
      const repo = manager.getRepository(EstimateCostLine);
      const line = await lineOfRevision(manager, revision.id, repo, lineId);
      if (dto.category !== undefined) line.category = dto.category;
      if (dto.description !== undefined) {
        line.description = trimToNull(dto.description);
      }
      if (dto.amount !== undefined) line.amount = dto.amount;
      await repo.save(line);
    });
  }

  deleteCostLine(
    id: number,
    lineId: number,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.price(id, actor, async ({ manager, revision }) => {
      const repo = manager.getRepository(EstimateCostLine);
      const line = await lineOfRevision(manager, revision.id, repo, lineId);
      await repo.delete({ id: line.id });
    });
  }

  /**
   * Marks the revision priced. Refused (400) while a BOM line still costs 0, naming the item
   * codes: a quotation built on it would price those materials at nothing.
   */
  complete(id: number, actor: AuthUserPayload): Promise<EstimateRevisionView> {
    return this.price(id, actor, async ({ manager, revision }) => {
      const tree = await loadRevisionTree(manager, revision.id);
      const unpriced = tree.panels.flatMap(({ bomLines }) =>
        bomLines.filter((line) => line.unitCost === 0),
      );
      if (unpriced.length > 0) {
        const codes = [...new Set(unpriced.map((line) => line.itemCode))];
        throw new BadRequestException(
          `Every BOM line needs a unit cost before the estimate is priced; no cost for: ${codes.join(', ')}.`,
        );
      }
      revision.pricedAt = new Date();
      revision.pricedBy = actor.userId;
    });
  }

  /** Runs one pricing step on the locked revision, then recomputes and returns the revision. */
  private price(
    estimateId: number,
    actor: AuthUserPayload,
    work: (context: PricingContext) => Promise<void>,
  ): Promise<EstimateRevisionView> {
    return this.dataSource.transaction(async (manager) => {
      const { estimate, request } = await this.lock(manager, estimateId, actor);
      const revision = await this.estimates.latestRevisionOf(manager, estimate);
      this.assertPriceable(revision, request);

      await work({ manager, revision });

      estimate.updatedBy = actor.userId;
      return presentRevision(
        await recalculateRevision(manager, revision, estimate),
        actor,
      );
    });
  }

  /** The estimate, then its request, locked for the transaction; the request must be in the actor's scope. */
  private async lock(
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
    return {
      estimate,
      request: this.dataScope.assertVisible(actor, request, ESTIMATE_LABEL),
    };
  }

  private assertPriceable(
    revision: EstimateRevision,
    request: SalesRequest,
  ): void {
    if (revision.status !== EstimateRevisionStatus.SUBMITTED) {
      throw new ConflictException(
        `Revision ${revision.revision} is ${revision.status}; only a submitted revision can be priced.`,
      );
    }
    if (revision.pricedAt) {
      throw new ConflictException(
        `Revision ${revision.revision} is already priced and read-only; the engineer must open a new revision to change it.`,
      );
    }
    if (request.status !== RequestStatus.ESTIMATED) {
      throw new ConflictException(
        `An estimate of a request ${request.status} cannot be priced.`,
      );
    }
  }
}
