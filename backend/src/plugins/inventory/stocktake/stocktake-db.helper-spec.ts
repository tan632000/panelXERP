import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import {
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  reservationKit,
  type ReservationKit,
} from '@plugins/inventory/material/reservation-db.helper-spec';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';
import { StocktakeApprovalService } from '@plugins/inventory/stocktake/services/stocktake-approval.service';
import { StocktakeReferenceService } from '@plugins/inventory/stocktake/services/stocktake-reference.service';
import { StocktakeService } from '@plugins/inventory/stocktake/services/stocktake.service';
import { StocktakeController } from '@plugins/inventory/stocktake/stocktake.controller';

import type { App } from 'supertest/types';
import type { QueryRunner } from 'typeorm';

/** Stands in for the JWT guard: the actor travels in a header instead of a token. */
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    req.user = JSON.parse(req.headers['x-test-actor']) as unknown;
    return true;
  }
}

/** Only one count may be open in the whole database: the suites take turns on this key. */
const OPEN_COUNT_LOCK = 7_420_014;

export interface StocktakeHarness {
  db: InventoryDb;
  kit: ReservationKit;
  itemChecks: ReferenceCheckRegistry;
  /** Seeded users acting with the grants of a role. */
  as(username: string, role: string): Promise<string>;
  STOREKEEPER: string;
  DIRECTOR: string;
  /**
   * An item kept at the suite's own location, so the suite's counts hold its lines. A count of
   * the whole warehouse would hold every item with stock in the database, other suites' fixtures
   * included, and keep them from being deleted.
   */
  item(spec?: { referencePrice?: number | null }): Promise<number>;
  /** Opens a count; a 201 is remembered for the cleanup. */
  open(
    token: string,
    body?: Record<string, unknown>,
  ): Promise<request.Response>;
  scan(token: string, id: number, code: string): request.Test;
  count(
    token: string,
    id: number,
    itemId: number,
    countedQty: number,
  ): request.Test;
  act(token: string, id: number, action: string, reason?: string): request.Test;
  get(token: string, id: number): request.Test;
  stockOf(itemId: number, quantity: string, unitCost: number): Promise<void>;
  issue(itemId: number, quantity: string): Promise<void>;
  /** The code of an item made by the inventory helper. */
  codeOf(itemId: number): Promise<string>;
  movementsOf(itemId: number): Promise<number>;
  close(): Promise<void>;
}

/**
 * The stock count endpoints over the real Postgres of the compose stack, with the reservation
 * and alert services they call. Holds a session lock for the life of the suite, so the suites
 * that open counts never run their counts side by side. Named `*.helper-spec.ts` so the build
 * leaves it out and jest does not run it as a test.
 */
export async function openStocktakeHarness(): Promise<StocktakeHarness> {
  const db = await openInventoryDb();
  const turn: QueryRunner = db.dataSource.createQueryRunner();
  await turn.connect();
  await turn.query(`SELECT pg_advisory_lock($1)`, [OPEN_COUNT_LOCK]);

  const [foreign]: Array<{ code: string }> = await db.dataSource.query(
    `SELECT code FROM stocktakes WHERE status IN ('counting', 'submitted') LIMIT 1`,
  );
  if (foreign) {
    throw new Error(
      `Stock count ${foreign.code} is open in this database: finish or cancel it before running these specs.`,
    );
  }

  const kit = reservationKit(db);
  const actor = (userId: number, role: string) =>
    JSON.stringify({ userId, role, permissions: seededRolePermissions(role) });
  const as = async (username: string, role: string) =>
    actor(await db.userId(username), role);
  const [location]: Array<{ id: number }> = await db.dataSource.query(
    `INSERT INTO locations (code, name) VALUES ($1, 'Stock count spec location') RETURNING id`,
    [`${db.tag}-L`],
  );
  const STOREKEEPER = await as('storekeeper', 'storekeeper');
  const DIRECTOR = await as('director', 'director');

  const moduleRef = await Test.createTestingModule({
    controllers: [StocktakeController],
    providers: [
      StocktakeService,
      StocktakeApprovalService,
      StocktakeReferenceService,
      ReferenceCheckRegistry,
      { provide: StockPostingService, useValue: db.posting },
      { provide: ReservationService, useValue: kit.reservations },
      { provide: ShortageAlertService, useValue: kit.alerts },
      { provide: DataSource, useValue: db.dataSource },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const http = () => request(app.getHttpServer());
  const base = '/inventory/stocktakes';
  const created: number[] = [];
  let documentNo = 0;

  return {
    db,
    kit,
    itemChecks: moduleRef.get(ReferenceCheckRegistry),
    as,
    STOREKEEPER,
    DIRECTOR,
    async item(spec = {}) {
      const id = await db.createItem(spec);
      await db.dataSource.query(
        `UPDATE items SET default_location_id = $2 WHERE id = $1`,
        [id, location.id],
      );
      return id;
    },
    async open(token, body = { scope: 'location', locationId: location.id }) {
      const res = await http()
        .post(base)
        .set({ 'x-test-actor': token })
        .send(body);
      if (res.status === 201) created.push((res.body as { id: number }).id);
      return res;
    },
    scan: (token, id, code) =>
      http()
        .post(`${base}/${id}/scan`)
        .set({ 'x-test-actor': token })
        .send({ code }),
    count: (token, id, itemId, countedQty) =>
      http()
        .patch(`${base}/${id}/lines/${itemId}`)
        .set({ 'x-test-actor': token })
        .send({ countedQty }),
    act: (token, id, action, reason) =>
      http()
        .post(`${base}/${id}/${action}`)
        .set({ 'x-test-actor': token })
        .send(reason === undefined ? {} : { reason }),
    get: (token, id) =>
      http().get(`${base}/${id}`).set({ 'x-test-actor': token }),
    async stockOf(itemId, quantity, unitCost) {
      documentNo += 1;
      await db.post({
        documentType: 'spec_opening',
        documentId: documentNo,
        lines: [
          {
            itemId,
            movementType: StockMovementType.RECEIPT,
            quantity,
            unitCost,
          },
        ],
      });
    },
    async issue(itemId, quantity) {
      documentNo += 1;
      await db.post({
        documentType: 'spec_issue',
        documentId: documentNo,
        lines: [
          {
            itemId,
            movementType: StockMovementType.ISSUE,
            quantity: `-${quantity}`,
          },
        ],
      });
    },
    async codeOf(itemId) {
      const [row]: Array<{ code: string }> = await db.dataSource.query(
        `SELECT code FROM items WHERE id = $1`,
        [itemId],
      );
      return row.code;
    },
    async movementsOf(itemId) {
      const [row]: Array<{ count: string }> = await db.dataSource.query(
        `SELECT COUNT(*) AS count FROM stock_movements
          WHERE item_id = $1 AND document_type = 'stocktake'`,
        [itemId],
      );
      return Number(row.count);
    },
    async close() {
      await app.close();
      await kit.cleanup();
      const [extra]: Array<{ ids: number[] | null }> =
        await db.dataSource.query(
          `SELECT array_agg(DISTINCT sl.stocktake_id) AS ids FROM stocktake_lines sl
           JOIN items i ON i.id = sl.item_id WHERE i.code LIKE $1`,
          [`${db.tag}-%`],
        );
      const ids = [...new Set([...created, ...(extra?.ids ?? [])])];
      // Lines and the count log go with their count (ON DELETE CASCADE).
      await db.dataSource.query(
        `DELETE FROM stocktakes WHERE id = ANY($1::int[])`,
        [ids],
      );
      await db.dataSource.query(
        `UPDATE items SET default_location_id = NULL WHERE default_location_id = $1`,
        [location.id],
      );
      await db.dataSource.query(`DELETE FROM locations WHERE id = $1`, [
        location.id,
      ]);
      await turn.query(`SELECT pg_advisory_unlock($1)`, [OPEN_COUNT_LOCK]);
      await turn.release();
      await db.close();
    },
  };
}
