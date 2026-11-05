import { BadRequestException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';

import { MAX_ESTIMATE_AMOUNT } from '@plugins/sales/estimate/constants/estimate.constant';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { computeRevisionTotals } from '@plugins/sales/estimate/services/estimate-totals';

import type { EntityManager } from 'typeorm';

export interface EstimateBomLineView {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemBrand: string | null;
  itemUnit: string;
  quantity: number;
  unitCost: number;
  amount: number;
  note: string | null;
}

export interface EstimateCostLineView {
  id: number;
  category: string;
  description: string | null;
  amount: number;
}

export interface EstimatePanelView {
  id: number;
  tag: string;
  description: string | null;
  quantity: number;
  /** Cost of one panel. */
  unitCost: number;
  /** `unitCost × quantity`. */
  total: number;
  bomLines: EstimateBomLineView[];
  costLines: EstimateCostLineView[];
}

export interface EstimateRevisionView {
  id: number;
  estimateId: number;
  revision: number;
  status: string;
  total: number;
  submittedAt: Date | null;
  submittedBy: number | null;
  /** When sales marked the revision priced; null while it is a draft or awaits pricing. */
  pricedAt: Date | null;
  pricedBy: number | null;
  createdAt: Date;
  panels: EstimatePanelView[];
}

/** A revision's panels with their lines, as stored, in the order they were added. */
export interface RevisionTree {
  panels: Array<{
    panel: EstimatePanel;
    bomLines: EstimateBomLine[];
    costLines: EstimateCostLine[];
  }>;
}

export async function loadRevisionTree(
  manager: EntityManager,
  revisionId: number,
): Promise<RevisionTree> {
  const panels = await manager.getRepository(EstimatePanel).find({
    where: { revisionId },
    order: { id: 'ASC' },
  });
  if (panels.length === 0) return { panels: [] };

  const panelIds = panels.map((panel) => panel.id);
  const [bomLines, costLines] = await Promise.all([
    manager.getRepository(EstimateBomLine).find({
      where: { panelId: In(panelIds) },
      order: { id: 'ASC' },
    }),
    manager.getRepository(EstimateCostLine).find({
      where: { panelId: In(panelIds) },
      order: { id: 'ASC' },
    }),
  ]);

  return {
    panels: panels.map((panel) => ({
      panel,
      bomLines: bomLines.filter((line) => line.panelId === panel.id),
      costLines: costLines.filter((line) => line.panelId === panel.id),
    })),
  };
}

/** A panel counts only when it belongs to the revision being worked on. */
export async function panelOfRevision(
  manager: EntityManager,
  revisionId: number,
  panelId: number,
): Promise<EstimatePanel> {
  const panel = await manager
    .getRepository(EstimatePanel)
    .findOne({ where: { id: panelId, revisionId } });
  if (!panel) throw new NotFoundException('Panel not found');
  return panel;
}

/** A line counts only when its panel belongs to the revision being worked on. */
export async function lineOfRevision<
  T extends EstimateBomLine | EstimateCostLine,
>(
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

export function toRevisionView(
  revision: EstimateRevision,
  tree: RevisionTree,
): EstimateRevisionView {
  return {
    id: revision.id,
    estimateId: revision.estimateId,
    revision: revision.revision,
    status: revision.status,
    total: revision.total,
    submittedAt: revision.submittedAt ?? null,
    submittedBy: revision.submittedBy ?? null,
    pricedAt: revision.pricedAt ?? null,
    pricedBy: revision.pricedBy ?? null,
    createdAt: revision.createdAt,
    panels: tree.panels.map(({ panel, bomLines, costLines }) => ({
      id: panel.id,
      tag: panel.tag,
      description: panel.description ?? null,
      quantity: panel.quantity,
      unitCost: panel.unitCost,
      total: panel.total,
      bomLines: bomLines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        itemBrand: line.itemBrand ?? null,
        itemUnit: line.itemUnit,
        quantity: line.quantity,
        unitCost: line.unitCost,
        amount: line.amount,
        note: line.note ?? null,
      })),
      costLines: costLines.map((line) => ({
        id: line.id,
        category: line.category,
        description: line.description ?? null,
        amount: line.amount,
      })),
    })),
  };
}

export async function loadRevisionView(
  manager: EntityManager,
  revision: EstimateRevision,
): Promise<EstimateRevisionView> {
  return toRevisionView(revision, await loadRevisionTree(manager, revision.id));
}

/**
 * Recomputes every figure of the revision on the server and stores the ones that changed: BOM
 * line amounts, panel unit costs and totals, the revision total, and the estimate header when
 * the revision is its latest. Whatever a client displayed is never an input.
 *
 * Runs on the caller's transaction, after the change that made the figures stale.
 */
export async function recalculateRevision(
  manager: EntityManager,
  revision: EstimateRevision,
  estimate: Estimate,
): Promise<EstimateRevisionView> {
  const tree = await loadRevisionTree(manager, revision.id);
  const computed = computeRevisionTotals(
    tree.panels.map(({ panel, bomLines, costLines }) => ({
      quantity: panel.quantity,
      bomLines,
      costLines,
    })),
  );

  const biggest = Math.max(
    computed.total,
    ...computed.panels.flatMap((panel) => [panel.total, ...panel.lineAmounts]),
  );
  if (biggest > MAX_ESTIMATE_AMOUNT) {
    throw new BadRequestException(
      `An amount of the estimate exceeds ${MAX_ESTIMATE_AMOUNT.toLocaleString('en-US')} VND.`,
    );
  }

  const bomRepo = manager.getRepository(EstimateBomLine);
  const panelRepo = manager.getRepository(EstimatePanel);
  for (const [index, { panel, bomLines }] of tree.panels.entries()) {
    const figures = computed.panels[index];
    for (const [lineIndex, line] of bomLines.entries()) {
      if (line.amount !== figures.lineAmounts[lineIndex]) {
        line.amount = figures.lineAmounts[lineIndex];
        await bomRepo.save(line);
      }
    }
    if (panel.unitCost !== figures.unitCost || panel.total !== figures.total) {
      panel.unitCost = figures.unitCost;
      panel.total = figures.total;
      await panelRepo.save(panel);
    }
  }

  revision.total = computed.total;
  await manager.getRepository(EstimateRevision).save(revision);
  if (estimate.latestRevision === revision.revision) {
    estimate.total = computed.total;
    await manager.getRepository(Estimate).save(estimate);
  }

  return toRevisionView(revision, tree);
}
