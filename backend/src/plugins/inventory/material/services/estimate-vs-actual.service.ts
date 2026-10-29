import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { canReadPurchasePrice } from '@plugins/inventory/_shared/utils/purchase-price.util';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { MaterialOrderHeader } from '@plugins/sales/_shared/ports/order-material-read.port';

/** One item of the order: what was estimated against what went to the workshop, net. */
export interface EstimateVsActualRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  estimatedQty: number;
  /** Issued less returned. */
  actualQty: number;
  /** `actual − estimated`. */
  qtyVariance: number;
  estimatedCost?: number;
  /** Σ issue values − Σ workshop return values. */
  actualCost?: number;
  costVariance?: number;
}

export interface OverBomIssueRow {
  issueCode: string;
  issuedAt: Date;
  itemId: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  reason: string;
  /** The panel the line was issued for, when it named one. */
  panelTag: string | null;
}

export interface UnlinkedEstimateLine {
  bomLineId: number;
  panelTag: string;
  itemCode: string;
  itemName: string;
  perPanelQuantity: number;
}

export interface EstimateVsActualReport {
  order: MaterialOrderHeader;
  items: EstimateVsActualRow[];
  overBomIssues: OverBomIssueRow[];
  unlinked: UnlinkedEstimateLine[];
  /** Only with `purchase_price:read`. */
  totals?: { estimatedCost: number; actualCost: number; costVariance: number };
}

interface Figures {
  itemCode: string;
  itemName: string;
  itemUnit: string;
  estimatedQty: Decimal;
  estimatedCost: Decimal;
  actualQty: Decimal;
  actualCost: Decimal;
}

type RawRow = Record<string, unknown>;

/**
 * Estimate against actual material of one order. The estimate is the order's BOM (quantities)
 * and the estimate revision it was quoted from (costs); the actual is what the stock ledger
 * moved for the order, issues net of workshop returns. Costs are purchase costs: they reach
 * only a reader holding `purchase_price:read`, and no sales price, total or margin ever does.
 */
@Injectable()
export class EstimateVsActualService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataScope: DataScopeService,
  ) {}

  async report(
    orderId: number,
    actor: AuthUserPayload,
  ): Promise<EstimateVsActualReport> {
    const manager = this.dataSource.manager;
    const order = await this.orders.getOrder(manager, orderId);
    if (!order || !this.dataScope.canSeeMaterial(actor, order)) {
      throw new NotFoundException('Order not found');
    }
    const lines =
      (await this.orders.getLines(manager, [orderId])).get(orderId) ?? [];
    const estimatedCosts = await this.orders.estimatedCostByItem(
      manager,
      orderId,
    );

    const figures = new Map<number, Figures>();
    const figuresOf = (
      itemId: number,
      named: Pick<Figures, 'itemCode' | 'itemName' | 'itemUnit'>,
    ) => {
      let entry = figures.get(itemId);
      if (!entry) {
        entry = {
          ...named,
          estimatedQty: new Decimal(0),
          estimatedCost: new Decimal(0),
          actualQty: new Decimal(0),
          actualCost: new Decimal(0),
        };
        figures.set(itemId, entry);
      }
      return entry;
    };

    // Estimated quantity: the order's linked BOM, per panel times panels.
    for (const line of lines) {
      for (const bom of line.bomLines) {
        if (bom.itemId === null) continue;
        const entry = figuresOf(bom.itemId, bom);
        entry.estimatedQty = entry.estimatedQty.add(
          new Decimal(bom.quantity).mul(line.quantity),
        );
      }
    }

    // Actual: the ledger, issues negative and returns positive, so the negated sums are net.
    const moved: RawRow[] = await manager.query(
      `SELECT m.item_id, i.code, i.name, i.unit,
              (-SUM(m.quantity))::text AS quantity, (-SUM(m.value))::text AS value
         FROM stock_movements m
         JOIN items i ON i.id = m.item_id
        WHERE m.order_id = $1 AND m.movement_type IN ('issue', 'workshop_return')
        GROUP BY m.item_id, i.code, i.name, i.unit`,
      [orderId],
    );
    for (const row of moved) {
      const entry = figuresOf(Number(row.item_id), {
        itemCode: String(row.code),
        itemName: String(row.name),
        itemUnit: String(row.unit),
      });
      entry.actualQty = new Decimal(String(row.quantity));
      entry.actualCost = new Decimal(String(row.value));
    }
    // Every item the estimate costs gets its row, also one the order's linked BOM does not
    // hold (a legacy unlinked line, a BOM changed after the quotation): the estimated total
    // then never depends on whether the item has been issued yet.
    const unnamed = [...estimatedCosts.keys()].filter(
      (itemId) => !figures.has(itemId),
    );
    if (unnamed.length > 0) {
      const items: RawRow[] = await manager.query(
        `SELECT id, code, name, unit FROM items WHERE id = ANY($1::int[])`,
        [unnamed],
      );
      for (const item of items) {
        figuresOf(Number(item.id), {
          itemCode: String(item.code),
          itemName: String(item.name),
          itemUnit: String(item.unit),
        });
      }
    }
    for (const [itemId, cost] of estimatedCosts) {
      const entry = figures.get(itemId);
      if (entry) entry.estimatedCost = new Decimal(cost);
    }

    const withCosts = canReadPurchasePrice(actor);
    const items = [...figures.entries()]
      .map(([itemId, entry]) => {
        const row: EstimateVsActualRow = {
          itemId,
          itemCode: entry.itemCode,
          itemName: entry.itemName,
          itemUnit: entry.itemUnit,
          estimatedQty: entry.estimatedQty.toNumber(),
          actualQty: entry.actualQty.toNumber(),
          qtyVariance: entry.actualQty.sub(entry.estimatedQty).toNumber(),
        };
        if (withCosts) {
          row.estimatedCost = entry.estimatedCost.toNumber();
          row.actualCost = entry.actualCost.toNumber();
          row.costVariance = entry.actualCost
            .sub(entry.estimatedCost)
            .toNumber();
        }
        return row;
      })
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode));

    const report: EstimateVsActualReport = {
      order,
      items,
      overBomIssues: await this.overBomIssues(orderId, lines),
      unlinked: lines.flatMap((line) =>
        line.bomLines
          .filter((bom) => bom.itemId === null)
          .map((bom) => ({
            bomLineId: bom.id,
            panelTag: line.tag,
            itemCode: bom.itemCode,
            itemName: bom.itemName,
            perPanelQuantity: Number(bom.quantity),
          })),
      ),
    };
    if (withCosts) {
      const sum = (pick: (entry: Figures) => Decimal) =>
        [...figures.values()].reduce(
          (total, entry) => total.add(pick(entry)),
          new Decimal(0),
        );
      const estimatedCost = sum((entry) => entry.estimatedCost);
      const actualCost = sum((entry) => entry.actualCost);
      report.totals = {
        estimatedCost: estimatedCost.toNumber(),
        actualCost: actualCost.toNumber(),
        costVariance: actualCost.sub(estimatedCost).toNumber(),
      };
    }
    return report;
  }

  /** Every issue line that carried an over-BOM reason, with its document and panel. */
  private async overBomIssues(
    orderId: number,
    lines: ReadonlyArray<{ id: number; tag: string }>,
  ): Promise<OverBomIssueRow[]> {
    const tagOf = new Map(lines.map((line) => [line.id, line.tag]));
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT s.code, s.created_at, l.item_id, i.code AS item_code, i.name AS item_name,
              l.quantity::text AS quantity, l.reason, l.order_line_id
         FROM stock_issue_lines l
         JOIN stock_issues s ON s.id = l.issue_id
         JOIN items i ON i.id = l.item_id
        WHERE s.order_id = $1 AND l.reason IS NOT NULL
        ORDER BY s.id, l.id`,
      [orderId],
    );
    return rows.map((row) => ({
      issueCode: String(row.code),
      issuedAt: row.created_at as Date,
      itemId: Number(row.item_id),
      itemCode: String(row.item_code),
      itemName: String(row.item_name),
      quantity: Number(row.quantity),
      reason: String(row.reason),
      panelTag:
        row.order_line_id === null
          ? null
          : (tagOf.get(Number(row.order_line_id)) ?? null),
    }));
  }
}
