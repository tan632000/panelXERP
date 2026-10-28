import { NotFoundException } from '@nestjs/common';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  openMaterialWorld,
  type MaterialWorld,
} from '@plugins/inventory/material/material-db.helper-spec';
import { MaterialService } from '@plugins/inventory/material/services/material.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

describeWithDatabase('MaterialService (real Postgres)', () => {
  let db: InventoryDb;
  let world: MaterialWorld;
  let service: MaterialService;
  const PURCHASING: AuthUserPayload = { userId: 50, role: 'purchasing' };

  beforeAll(async () => {
    db = await openInventoryDb();
    world = await openMaterialWorld(db);
    service = new MaterialService(
      db.dataSource,
      new OrderMaterialReadPort(),
      new DataScopeService(),
    );
  });

  afterAll(async () => {
    await world?.cleanup();
    await db?.close();
  });

  it('computes demand per item as BOM quantity per panel times panels', async () => {
    const detail = await service.findOrder(world.ownOrder, PURCHASING);

    expect(detail.demandBearing).toBe(true);
    expect(detail.items).toEqual([
      expect.objectContaining({
        itemId: world.itemA,
        demand: 6,
        reserved: 0,
        issued: 0,
        returned: 0,
        short: 6,
      }),
      // 1.5 needed, 0.5 issued less 0.2 returned, 0.5 reserved: 0.7 still short.
      expect.objectContaining({
        itemId: world.itemB,
        demand: 1.5,
        reserved: 0.5,
        issued: 0.5,
        returned: 0.2,
        short: 0.7,
      }),
    ]);
  });

  it('shows each panel’s BOM with its demand and lists the unlinked line apart', async () => {
    const detail = await service.findOrder(world.ownOrder, PURCHASING);

    expect(detail.panels.map((panel) => panel.tag)).toEqual([
      'MSB-01',
      'DB-02',
    ]);
    expect(detail.panels[0].bomLines).toEqual([
      expect.objectContaining({
        itemId: world.itemA,
        perPanelQuantity: 3,
        demand: 6,
      }),
    ]);
    expect(detail.unlinked).toEqual([
      expect.objectContaining({
        tag: 'MSB-01',
        itemCode: 'LEGACY-01',
        perPanelQuantity: 5,
      }),
    ]);
    // The unlinked 5 × 2 never reaches the demand.
    expect(detail.items.map((item) => item.itemCode)).not.toContain(
      'LEGACY-01',
    );
  });

  it('gives an order that no longer needs materials no demand', async () => {
    const detail = await service.findOrder(world.deliveredOrder, PURCHASING);
    expect(detail.demandBearing).toBe(false);
    expect(detail.items.every((item) => item.demand === 0)).toBe(true);
    expect(detail.items.every((item) => item.short === 0)).toBe(true);
  });

  it('counts the short items and the unlinked lines in the list', async () => {
    const page = await service.findOrders({ search: world.tag }, PURCHASING);

    expect(page.meta.total).toBe(3);
    expect(page.data.find((row) => row.id === world.ownOrder)).toMatchObject({
      shortLineCount: 2,
      unlinkedCount: 1,
    });
    // Delivered: still listed, nothing short.
    expect(
      page.data.find((row) => row.id === world.deliveredOrder),
    ).toMatchObject({ shortLineCount: 0 });
  });

  it('answers 404 for an unknown order', async () => {
    await expect(
      service.findOrder(2147483000, PURCHASING),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
