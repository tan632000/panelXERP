import { In } from 'typeorm';

import { QuotationBomLine } from '@plugins/sales/quotation/entities/quotation-bom-line.entity';
import { QuotationCostLine } from '@plugins/sales/quotation/entities/quotation-cost-line.entity';
import { QuotationLine } from '@plugins/sales/quotation/entities/quotation-line.entity';
import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { computeQuotationPricing } from '@plugins/sales/quotation/services/quotation-pricing';

import type { EstimatePanelView } from '@plugins/sales/estimate/utils/estimate-revision.util';
import type { EntityManager } from 'typeorm';

export interface QuotationBomLineView {
  id: number;
  itemCode: string;
  itemName: string;
  itemBrand: string | null;
  itemUnit: string;
  quantity: number;
}

export interface QuotationCostLineView {
  id: number;
  category: string;
  description: string | null;
}

export interface QuotationLineView {
  id: number;
  tag: string;
  description: string | null;
  quantity: number;
  unitCost: number;
  marginPercent: number;
  unitPrice: number;
  amount: number;
  bomLines: QuotationBomLineView[];
  costLines: QuotationCostLineView[];
}

export interface QuotationVersionView {
  id: number;
  quotationId: number;
  ver: number;
  status: string;
  estimateRevisionId: number;
  estimateRevision: number;
  discountType: string;
  discountValue: number;
  vatRate: number;
  subtotal: number;
  discountAmount: number;
  taxable: number;
  vatAmount: number;
  total: number;
  terms: string[];
  createdBy: number | null;
  lastEditedBy: number | null;
  createdAt: Date;
  decidedBy: number | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  lines: QuotationLineView[];
}

/** A version's panel lines with the frozen BOM and cost-line copies, in the order created. */
export interface VersionTree {
  lines: Array<{
    line: QuotationLine;
    bomLines: QuotationBomLine[];
    costLines: QuotationCostLine[];
  }>;
}

export async function loadVersionTree(
  manager: EntityManager,
  versionId: number,
): Promise<VersionTree> {
  const lines = await manager.getRepository(QuotationLine).find({
    where: { versionId },
    order: { id: 'ASC' },
  });
  if (lines.length === 0) return { lines: [] };

  const lineIds = lines.map((line) => line.id);
  const [bomLines, costLines] = await Promise.all([
    manager.getRepository(QuotationBomLine).find({
      where: { lineId: In(lineIds) },
      order: { id: 'ASC' },
    }),
    manager.getRepository(QuotationCostLine).find({
      where: { lineId: In(lineIds) },
      order: { id: 'ASC' },
    }),
  ]);
  return {
    lines: lines.map((line) => ({
      line,
      bomLines: bomLines.filter((bom) => bom.lineId === line.id),
      costLines: costLines.filter((cost) => cost.lineId === line.id),
    })),
  };
}

export function toVersionView(
  version: QuotationVersion,
  tree: VersionTree,
): QuotationVersionView {
  return {
    id: version.id,
    quotationId: version.quotationId,
    ver: version.ver,
    status: version.status,
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
    terms: version.terms,
    createdBy: version.createdBy ?? null,
    lastEditedBy: version.lastEditedBy ?? null,
    createdAt: version.createdAt,
    decidedBy: version.decidedBy ?? null,
    decidedAt: version.decidedAt ?? null,
    decisionReason: version.decisionReason ?? null,
    lines: tree.lines.map(({ line, bomLines, costLines }) => ({
      id: line.id,
      tag: line.tag,
      description: line.description ?? null,
      quantity: line.quantity,
      unitCost: line.unitCost,
      marginPercent: line.marginPercent,
      unitPrice: line.unitPrice,
      amount: line.amount,
      bomLines: bomLines.map((bom) => ({
        id: bom.id,
        itemCode: bom.itemCode,
        itemName: bom.itemName,
        itemBrand: bom.itemBrand ?? null,
        itemUnit: bom.itemUnit,
        quantity: bom.quantity,
      })),
      costLines: costLines.map((cost) => ({
        id: cost.id,
        category: cost.category,
        description: cost.description ?? null,
      })),
    })),
  };
}

/**
 * Recomputes every figure of the version on the server and stores them: line unit prices and
 * amounts, and the version's subtotal, discount, VAT and total. Whatever a
 * client displayed is never an input. A discount above the subtotal is a 400 before anything
 * is written.
 *
 * Runs on the caller's transaction, after the change that made the figures stale.
 */
export async function recalculateVersion(
  manager: EntityManager,
  version: QuotationVersion,
  tree: VersionTree,
): Promise<void> {
  const pricing = computeQuotationPricing({
    lines: tree.lines.map(({ line }) => line),
    discountType: version.discountType,
    discountValue: version.discountValue,
    vatRate: version.vatRate,
  });

  const lineRepo = manager.getRepository(QuotationLine);
  for (const [index, { line }] of tree.lines.entries()) {
    line.unitPrice = pricing.lines[index].unitPrice;
    line.amount = pricing.lines[index].amount;
    await lineRepo.save(line);
  }

  version.subtotal = pricing.subtotal;
  version.discountAmount = pricing.discountAmount;
  version.taxable = pricing.taxable;
  version.vatAmount = pricing.vatAmount;
  version.total = pricing.total;
  await manager.getRepository(QuotationVersion).save(version);
}

/**
 * Writes the lines of a first version from the estimate's panels: cost, quantity, a zero
 * margin, and a copy of each panel's BOM lines (item name, code, brand, unit, quantity) and
 * cost-line names. The copy is what the customer reads; the estimate is not consulted again.
 */
export async function snapshotEstimatePanels(
  manager: EntityManager,
  versionId: number,
  panels: readonly EstimatePanelView[],
): Promise<VersionTree> {
  const lineRepo = manager.getRepository(QuotationLine);
  const bomRepo = manager.getRepository(QuotationBomLine);
  const costRepo = manager.getRepository(QuotationCostLine);
  const tree: VersionTree = { lines: [] };

  for (const panel of panels) {
    const line = await lineRepo.save(
      lineRepo.create({
        versionId,
        tag: panel.tag,
        description: panel.description,
        quantity: panel.quantity,
        unitCost: panel.unitCost,
        marginPercent: 0,
        unitPrice: 0,
        amount: 0,
      }),
    );
    const bomLines = await bomRepo.save(
      panel.bomLines.map((bom) =>
        bomRepo.create({
          lineId: line.id,
          itemId: bom.itemId,
          itemCode: bom.itemCode,
          itemName: bom.itemName,
          itemBrand: bom.itemBrand,
          itemUnit: bom.itemUnit,
          quantity: bom.quantity,
        }),
      ),
    );
    const costLines = await costRepo.save(
      panel.costLines.map((cost) =>
        costRepo.create({
          lineId: line.id,
          category: cost.category,
          description: cost.description,
        }),
      ),
    );
    tree.lines.push({ line, bomLines, costLines });
  }
  return tree;
}

/** Copies lines, their pricing and the frozen BOM/cost-line copies into another version. */
export async function copyVersionTree(
  manager: EntityManager,
  from: VersionTree,
  toVersionId: number,
): Promise<void> {
  const lineRepo = manager.getRepository(QuotationLine);
  const bomRepo = manager.getRepository(QuotationBomLine);
  const costRepo = manager.getRepository(QuotationCostLine);

  for (const { line, bomLines, costLines } of from.lines) {
    const copy = await lineRepo.save(
      lineRepo.create({
        versionId: toVersionId,
        tag: line.tag,
        description: line.description ?? null,
        quantity: line.quantity,
        unitCost: line.unitCost,
        marginPercent: line.marginPercent,
        unitPrice: line.unitPrice,
        amount: line.amount,
      }),
    );
    await bomRepo.save(
      bomLines.map((bom) =>
        bomRepo.create({
          lineId: copy.id,
          itemId: bom.itemId,
          itemCode: bom.itemCode,
          itemName: bom.itemName,
          itemBrand: bom.itemBrand ?? null,
          itemUnit: bom.itemUnit,
          quantity: bom.quantity,
        }),
      ),
    );
    await costRepo.save(
      costLines.map((cost) =>
        costRepo.create({
          lineId: copy.id,
          category: cost.category,
          description: cost.description ?? null,
        }),
      ),
    );
  }
}
