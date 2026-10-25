import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { uniqueViolationConflict } from '@shared/utils/db-error.util';

import {
  requireText,
  trimToNull,
} from '@plugins/sales/_shared/utils/text.util';
import {
  CreateBomLineDto,
  UpdateBomLineDto,
} from '@plugins/sales/estimate/dto/bom-line.dto';
import {
  CreateCostLineDto,
  UpdateCostLineDto,
} from '@plugins/sales/estimate/dto/cost-line.dto';
import {
  CreatePanelDto,
  UpdatePanelDto,
} from '@plugins/sales/estimate/dto/panel.dto';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import {
  recalculateRevision,
  type EstimateRevisionView,
} from '@plugins/sales/estimate/utils/estimate-revision.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager, Repository } from 'typeorm';

/** What an edit works on: the manager of its transaction and the locked, editable draft. */
interface DraftContext {
  manager: EntityManager;
  revision: EstimateRevision;
}

const PANEL_LABEL = 'Panel';

/** The catalog columns a BOM line copies; read here because the catalog entity is not importable. */
interface LockedItem {
  id: number;
  code: string;
  name: string;
  brand: string | null;
  unit: string;
  /** 0 when the item has no reference price. */
  referencePrice: number;
}

/**
 * Edits of the draft revision: panels, BOM lines and cost lines. Every edit runs in one
 * transaction that locks the estimate (and its request), so it cannot interleave with a submit
 * or a revise, refuses a revision that is no longer a draft, and ends by recomputing every
 * figure on the server. Each returns the whole revision as it now stands.
 */
@Injectable()
export class EstimateEditService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly estimates: EstimateService,
  ) {}

  addPanel(
    id: number,
    dto: CreatePanelDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.edit(id, actor, async ({ manager, revision }) => {
      const tag = requireText(dto.tag, 'Tag is required.');
      await this.assertTagFree(manager, revision.id, tag);
      const repo = manager.getRepository(EstimatePanel);
      await this.savePanel(
        repo,
        repo.create({
          revisionId: revision.id,
          tag,
          description: trimToNull(dto.description),
          quantity: dto.quantity,
          unitCost: 0,
          total: 0,
        }),
      );
    });
  }

  updatePanel(
    id: number,
    panelId: number,
    dto: UpdatePanelDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.edit(id, actor, async ({ manager, revision }) => {
      const panel = await this.panelOf(manager, revision.id, panelId);
      if (dto.tag !== undefined) {
        const tag = requireText(dto.tag, 'Tag is required.');
        if (tag.toLowerCase() !== panel.tag.toLowerCase()) {
          await this.assertTagFree(manager, revision.id, tag);
        }
        panel.tag = tag;
      }
      if (dto.description !== undefined) {
        panel.description = trimToNull(dto.description);
      }
      if (dto.quantity !== undefined) panel.quantity = dto.quantity;
      await this.savePanel(manager.getRepository(EstimatePanel), panel);
    });
  }

  deletePanel(
    id: number,
    panelId: number,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.edit(id, actor, async ({ manager, revision }) => {
      const panel = await this.panelOf(manager, revision.id, panelId);
      // Explicit, not left to the foreign keys' cascade: the lines go in this transaction.
      await manager.getRepository(EstimateBomLine).delete({ panelId });
      await manager.getRepository(EstimateCostLine).delete({ panelId });
      await manager.getRepository(EstimatePanel).delete({ id: panel.id });
    });
  }

  /**
   * Adds a material to a panel. The item's code, name, brand and unit are copied onto the line
   * now; the unit cost defaults to the item's reference price (0 when it has none).
   */
  addBomLine(
    id: number,
    panelId: number,
    dto: CreateBomLineDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.edit(id, actor, async ({ manager, revision }) => {
      const panel = await this.panelOf(manager, revision.id, panelId);
      const item = await this.lockLiveItem(manager, dto.itemId);
      const repo = manager.getRepository(EstimateBomLine);
      await repo.save(
        repo.create({
          panelId: panel.id,
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          itemBrand: item.brand,
          itemUnit: item.unit,
          quantity: dto.quantity,
          unitCost: dto.unitCost ?? item.referencePrice,
          amount: 0,
          note: trimToNull(dto.note),
        }),
      );
    });
  }

  updateBomLine(
    id: number,
    lineId: number,
    dto: UpdateBomLineDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.edit(id, actor, async ({ manager, revision }) => {
      const repo = manager.getRepository(EstimateBomLine);
      const line = await this.lineOf(manager, revision.id, repo, lineId);
      if (dto.quantity !== undefined) line.quantity = dto.quantity;
      if (dto.unitCost !== undefined && dto.unitCost !== null) {
        line.unitCost = dto.unitCost;
      }
      if (dto.note !== undefined) line.note = trimToNull(dto.note);
      await repo.save(line);
    });
  }

  deleteBomLine(
    id: number,
    lineId: number,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.edit(id, actor, async ({ manager, revision }) => {
      const repo = manager.getRepository(EstimateBomLine);
      const line = await this.lineOf(manager, revision.id, repo, lineId);
      await repo.delete({ id: line.id });
    });
  }

  addCostLine(
    id: number,
    panelId: number,
    dto: CreateCostLineDto,
    actor: AuthUserPayload,
  ): Promise<EstimateRevisionView> {
    return this.edit(id, actor, async ({ manager, revision }) => {
      const panel = await this.panelOf(manager, revision.id, panelId);
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
    return this.edit(id, actor, async ({ manager, revision }) => {
      const repo = manager.getRepository(EstimateCostLine);
      const line = await this.lineOf(manager, revision.id, repo, lineId);
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
    return this.edit(id, actor, async ({ manager, revision }) => {
      const repo = manager.getRepository(EstimateCostLine);
      const line = await this.lineOf(manager, revision.id, repo, lineId);
      await repo.delete({ id: line.id });
    });
  }

  /** Runs one edit on the locked draft, then recomputes and returns the revision. */
  private edit(
    estimateId: number,
    actor: AuthUserPayload,
    work: (context: DraftContext) => Promise<void>,
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

      await work({ manager, revision });

      estimate.updatedBy = actor.userId;
      return recalculateRevision(manager, revision, estimate);
    });
  }

  /**
   * The catalog item, read on this transaction under a shared lock. A delete of the item takes
   * the row exclusively and re-checks references, so it waits for this line to commit and is
   * then refused, or it commits first and the item is gone here. The lock comes after the
   * estimate and request locks, and a delete holds this one alone, so the two cannot deadlock.
   */
  private async lockLiveItem(
    manager: EntityManager,
    itemId: number,
  ): Promise<LockedItem> {
    const rows: Array<{
      id: number;
      code: string;
      name: string;
      brand: string | null;
      unit: string;
      reference_price: string | number | null;
    }> = await manager.query(
      `SELECT id, code, name, brand, unit, reference_price
       FROM items WHERE id = $1 AND is_deleted = false FOR SHARE`,
      [itemId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Item must be an active catalog item.');
    }
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      brand: row.brand,
      unit: row.unit,
      referencePrice:
        row.reference_price === null ? 0 : Number(row.reference_price),
    };
  }

  /** A tag taken by a concurrent write answers 409 like the pre-check does. */
  private async savePanel(
    repo: Repository<EstimatePanel>,
    panel: EstimatePanel,
  ): Promise<void> {
    try {
      await repo.save(panel);
    } catch (error: unknown) {
      throw (
        uniqueViolationConflict(error, [
          {
            matches: ['uq_sales_estimate_panels_tag'],
            message: `Panel tag ${panel.tag} is already used.`,
          },
        ]) ?? error
      );
    }
  }

  private async panelOf(
    manager: EntityManager,
    revisionId: number,
    panelId: number,
  ): Promise<EstimatePanel> {
    const panel = await manager
      .getRepository(EstimatePanel)
      .findOne({ where: { id: panelId, revisionId } });
    if (!panel) throw new NotFoundException(`${PANEL_LABEL} not found`);
    return panel;
  }

  /** A line counts only when its panel belongs to the draft being edited. */
  private async lineOf<T extends EstimateBomLine | EstimateCostLine>(
    manager: EntityManager,
    revisionId: number,
    repo: {
      findOne: (options: { where: { id: number } }) => Promise<T | null>;
    },
    lineId: number,
  ): Promise<T> {
    const line = await repo.findOne({ where: { id: lineId } });
    if (!line) throw new NotFoundException('Line not found');
    const panel = await manager
      .getRepository(EstimatePanel)
      .findOne({ where: { id: line.panelId, revisionId } });
    if (!panel) throw new NotFoundException('Line not found');
    return line;
  }

  private async assertTagFree(
    manager: EntityManager,
    revisionId: number,
    tag: string,
  ): Promise<void> {
    const panels = await manager
      .getRepository(EstimatePanel)
      .find({ where: { revisionId } });
    const taken = panels.some(
      (panel) => panel.tag.toLowerCase() === tag.toLowerCase(),
    );
    if (taken) {
      throw new ConflictException(`Panel tag ${tag} is already used.`);
    }
  }
}
