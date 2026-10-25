import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { DataScopeService } from '@shared/services/data-scope.service';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { SalesOrderBomLine } from '@plugins/sales/order/entities/order-bom-line.entity';
import { SalesOrderLine } from '@plugins/sales/order/entities/order-line.entity';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { OrderConvertService } from '@plugins/sales/order/services/order-convert.service';
import { OrderEditService } from '@plugins/sales/order/services/order-edit.service';
import { OrderService } from '@plugins/sales/order/services/order.service';
import * as orderLock from '@plugins/sales/order/utils/order-lock.util';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import {
  describeWithDatabase,
  openQuotationDb,
  type PanelSpec,
  type QuotationDb,
} from '@plugins/sales/quotation/quotation-db.helper-spec';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

jest.setTimeout(60_000);

/**
 * Converting a customer-confirmed quotation into an order against the real Postgres of the
 * compose stack: the guards (not confirmed, second conversion, data scope), the copy of
 * lines and totals, the request moving to won, cancelling and editing, and the race the
 * request and header locks settle. Quotations are built through the real services.
 */
describeWithDatabase('Order conversion against Postgres', () => {
  let db: QuotationDb;
  let convert: OrderConvertService;
  let edit: OrderEditService;
  let orders: OrderService;

  beforeAll(async () => {
    db = await openQuotationDb([
      Customer,
      Project,
      Contact,
      Item,
      SalesOrder,
      SalesOrderLine,
      SalesOrderBomLine,
    ]);
    const dataScope = new DataScopeService();
    const statusPort = new RequestStatusPort();
    const crm = {
      getCustomerSummary: async (id: number) => {
        const [row]: Array<{
          id: number;
          name: string;
          tax_code: string | null;
          address: string | null;
        }> = await db.dataSource.query(
          `SELECT id, name, tax_code, address FROM customers WHERE id = $1`,
          [id],
        );
        return row
          ? {
              id: row.id,
              name: row.name,
              taxCode: row.tax_code,
              address: row.address,
            }
          : null;
      },
      getProjectSummary: () => Promise.resolve(null),
    };
    const users = { namesOf: () => Promise.resolve(new Map<number, string>()) };
    orders = new OrderService(
      db.dataSource.getRepository(SalesOrder),
      db.dataSource.getRepository(SalesOrderLine),
      db.dataSource.getRepository(SalesOrderBomLine),
      db.dataSource.getRepository(SalesRequest),
      db.dataSource.getRepository(Estimate),
      db.dataSource.getRepository(Quotation),
      dataScope,
      users as never,
    );
    convert = new OrderConvertService(
      db.dataSource,
      dataScope,
      orders,
      crm as never,
      statusPort,
      db.notifications as never,
    );
    edit = new OrderEditService(db.dataSource, dataScope, orders, statusPort);
  });
  beforeEach(() => {
    db.notifications.emit.mockClear();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.cleanup();
  });
  afterAll(async () => {
    await db?.close();
  });

  const PANELS: PanelSpec[] = [
    { tag: 'MSB-01', quantity: 2, unitCost: 1000 },
    { tag: 'DB-02', quantity: 1, unitCost: 4000 },
  ];

  const approved = async (creator: AuthUserPayload = db.salesA) => {
    const estimated = await db.estimatedRequest(PANELS);
    const quotation = await db.quotations.create(
      { requestId: estimated.requestId },
      creator,
    );
    await db.approvals.submit(quotation.id, creator);
    await db.approvals.approve(quotation.id, db.manager);
    return { ...estimated, id: quotation.id };
  };
  const confirmed = async () => {
    const made = await approved();
    await db.approvals.confirm(made.id, db.salesA);
    db.notifications.emit.mockClear();
    return made;
  };

  const requestRow = async (id: number) =>
    (
      await db.dataSource.query<
        Array<{ status: string; lost_reason: string | null }>
      >(`SELECT status, lost_reason FROM sales_requests WHERE id = $1`, [id])
    )[0];
  const orderCount = async (quotationId: number) =>
    Number(
      (
        await db.dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM sales_orders WHERE quotation_id = $1`,
          [quotationId],
        )
      )[0].count,
    );

  describe('converting', () => {
    it('copies the confirmed version into one order and moves the request to won', async () => {
      const made = await confirmed();
      const quotation = await db.quotations.findOne(made.id, db.salesA);

      const order = await convert.convert(
        {
          quotationId: made.id,
          contractNo: ' HD-01 ',
          deliveryDate: '2027-03-01',
        },
        db.salesA,
      );

      expect(order.code).toMatch(/^DH_\d{4}_\d{4}$/);
      expect(order).toMatchObject({
        status: 'open',
        quotationId: made.id,
        quotationVer: 1,
        requestId: made.requestId,
        estimateId: made.estimateId,
        estimateRevisionId: made.revisionId,
        customerName: 'QT spec customer',
        contractNo: 'HD-01',
        contractDate: null,
        deliveryDate: '2027-03-01',
        terms: quotation.current.terms,
        subtotal: quotation.current.subtotal,
        discountAmount: quotation.current.discountAmount,
        taxable: quotation.current.taxable,
        vatRate: quotation.current.vatRate,
        vatAmount: quotation.current.vatAmount,
        total: quotation.current.total,
      });
      expect(order.lines.map((line) => line.tag)).toEqual(
        quotation.current.lines.map((line) => line.tag),
      );
      expect(
        order.lines.map(({ tag, quantity, unitPrice, amount }) => ({
          tag,
          quantity,
          unitPrice,
          amount,
        })),
      ).toEqual(
        quotation.current.lines.map(({ tag, quantity, unitPrice, amount }) => ({
          tag,
          quantity,
          unitPrice,
          amount,
        })),
      );
      expect(order.lines[0].bomLines).toHaveLength(1);
      expect(order.chain).toMatchObject({
        request: { id: made.requestId },
        estimate: { id: made.estimateId, revision: 1 },
        quotation: { id: made.id, code: quotation.code, ver: 1 },
      });
      expect((await requestRow(made.requestId)).status).toBe('won');
      expect(db.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'sales.order.created',
          requiredScope: 'order:read',
        }),
      );
    });

    it('answers 409 to a version that is approved but not confirmed by the customer', async () => {
      const made = await approved();

      await expect(
        convert.convert({ quotationId: made.id }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await orderCount(made.id)).toBe(0);
      expect((await requestRow(made.requestId)).status).toBe('quoted');
    });

    it('answers 409 to a second conversion, also after the order was cancelled', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      await expect(
        convert.convert({ quotationId: made.id }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);

      await edit.cancel(order.id, { reason: 'Customer withdrew' }, db.manager);
      await expect(
        convert.convert({ quotationId: made.id }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await orderCount(made.id)).toBe(1);
    });

    it('makes exactly one order when two conversions race', async () => {
      for (let round = 0; round < 3; round += 1) {
        const made = await confirmed();

        const results = await Promise.allSettled([
          convert.convert({ quotationId: made.id }, db.salesA),
          convert.convert({ quotationId: made.id }, db.manager),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const loser = results.find((r) => r.status === 'rejected');
        expect((loser as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictException,
        );
        expect(await orderCount(made.id)).toBe(1);
      }
    });

    it('gives two quotations converted together two different codes', async () => {
      const [a, b] = [await confirmed(), await confirmed()];

      const [first, second] = await Promise.all([
        convert.convert({ quotationId: a.id }, db.salesA),
        convert.convert({ quotationId: b.id }, db.salesA),
      ]);

      expect(first.code).not.toBe(second.code);
    });

    it('answers 404 to a Sales actor converting another account’s quotation', async () => {
      const made = await confirmed();

      await expect(
        convert.convert({ quotationId: made.id }, db.salesB),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        convert.convert({ quotationId: 99_999_999 }, db.salesA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await orderCount(made.id)).toBe(0);
    });

    it('leaves nothing behind when the request cannot become won', async () => {
      const made = await confirmed();
      await db.dataSource.query(
        `UPDATE sales_requests SET status = 'estimated' WHERE id = $1`,
        [made.requestId],
      );

      await expect(
        convert.convert({ quotationId: made.id }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await orderCount(made.id)).toBe(0);
      expect(
        await db.dataSource.query(
          `SELECT 1 FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id WHERE o.request_id = $1`,
          [made.requestId],
        ),
      ).toHaveLength(0);
    });
  });

  describe('converting while the estimate is written', () => {
    it('waits at the estimate holding no request lock, so a writer holding the estimate can still take the request', async () => {
      const made = await confirmed();
      const writer = db.dataSource.createQueryRunner();
      await writer.connect();
      let converting: Promise<unknown> | undefined;
      try {
        // An estimate writer: it holds the estimate and will ask for the request next.
        await writer.startTransaction();
        await writer.query(
          `SELECT id FROM sales_estimates WHERE id = $1 FOR UPDATE`,
          [made.estimateId],
        );
        const pids = (await writer.query(
          `SELECT pg_backend_pid() AS pid`,
        )) as Array<{ pid: number }>;
        const { pid } = pids[0];

        converting = convert.convert({ quotationId: made.id }, db.salesA);
        converting.catch(() => undefined);

        // Convert is parked on a lock of the writer's. Poll the server for it, no fixed sleep;
        // only a backend blocked by this writer counts, never another spec's waiting query.
        const deadline = Date.now() + 10_000;
        let waitingOn = '';
        while (!waitingOn && Date.now() < deadline) {
          const rows: Array<{ query: string }> = await db.dataSource.query(
            `SELECT query FROM pg_stat_activity
             WHERE $1 = ANY(pg_blocking_pids(pid))`,
            [pid],
          );
          waitingOn = rows[0]?.query ?? '';
          if (!waitingOn) await new Promise((r) => setTimeout(r, 25));
        }
        expect(waitingOn).not.toBe('');

        // Convert holds no request lock yet, so the writer takes it at once. Were the request
        // locked first, this would deadlock with the convert (or hit the timeout).
        await writer.query(`SET LOCAL lock_timeout = '5s'`);
        await writer.query(
          `SELECT id FROM sales_requests WHERE id = $1 FOR UPDATE`,
          [made.requestId],
        );
      } finally {
        await writer.rollbackTransaction().catch(() => undefined);
        await writer.release();
        // Let a convert still running settle before the cleanup removes its rows.
        await converting?.catch(() => undefined);
      }

      await expect(converting).resolves.toMatchObject({ status: 'open' });
      expect(await orderCount(made.id)).toBe(1);
    });

    it('never deadlocks against an estimate revise, round after round', async () => {
      for (let round = 0; round < 4; round += 1) {
        const made = await confirmed();

        const results = await Promise.allSettled([
          convert.convert({ quotationId: made.id }, db.salesA),
          db.estimateService.revise(made.estimateId, db.engineer),
        ]);

        for (const result of results) {
          if (result.status === 'rejected') {
            // The estimate write may legitimately be refused; a lock cycle may not happen.
            expect(String((result.reason as Error).message)).not.toMatch(
              /deadlock/i,
            );
            expect((result.reason as { code?: string }).code).not.toBe('40P01');
          }
        }
        expect(results[0].status).toBe('fulfilled');
        expect(await orderCount(made.id)).toBe(1);
      }
    });
  });

  describe('the order is a snapshot', () => {
    it('does not follow a later edit of the quotation lines, the terms or the customer', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      await db.dataSource.query(
        `UPDATE sales_quotation_lines SET unit_price = 1, amount = 1
         WHERE version_id IN (SELECT id FROM sales_quotation_versions WHERE quotation_id = $1)`,
        [made.id],
      );
      await db.dataSource.query(
        `UPDATE sales_quotation_versions SET total = 1, terms = '["changed"]'::jsonb WHERE quotation_id = $1`,
        [made.id],
      );
      await db.dataSource.query(
        `UPDATE sales_quotation_bom_lines SET item_name = 'Changed item', quantity = 99
         WHERE line_id IN (
           SELECT l.id FROM sales_quotation_lines l
           JOIN sales_quotation_versions v ON v.id = l.version_id
           WHERE v.quotation_id = $1)`,
        [made.id],
      );
      await db.dataSource.query(
        `UPDATE customers SET name = 'Renamed customer' WHERE id = $1`,
        [db.customerId],
      );

      const after = await orders.findOne(order.id, db.salesA);
      expect(after.lines).toEqual(order.lines);
      expect(after.lines.flatMap((line) => line.bomLines)).not.toHaveLength(0);
      expect(
        after.lines.flatMap((line) => line.bomLines.map((bom) => bom.itemName)),
      ).not.toContain('Changed item');
      expect(after.total).toBe(order.total);
      expect(after.terms).toEqual(order.terms);
      expect(after.customerName).toBe('QT spec customer');
    });

    it('cannot be revised away: the confirmed version refuses a revision', async () => {
      const made = await confirmed();
      await convert.convert({ quotationId: made.id }, db.salesA);

      await expect(
        db.versions.revise(made.id, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reading', () => {
    it('answers 404 to Sales B reading Sales A’s order, in the detail and in the list', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      await expect(orders.findOne(order.id, db.salesB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const mine = await orders.findAll({}, db.salesA);
      const theirs = await orders.findAll({}, db.salesB);
      expect(mine.data.map((row) => row.id)).toContain(order.id);
      expect(theirs.data.map((row) => row.id)).not.toContain(order.id);
      const all = await orders.findAll({ search: order.code }, db.manager);
      expect(all.data.map((row) => row.id)).toContain(order.id);
    });
  });

  describe('cancelling', () => {
    it('cancels the order and loses the request with the reason; the quotation stays confirmed', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      const cancelled = await edit.cancel(
        order.id,
        { reason: ' Customer withdrew ' },
        db.manager,
      );

      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelReason: 'Customer withdrew',
        cancelledBy: db.manager.userId,
      });
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
      expect(await requestRow(made.requestId)).toEqual({
        status: 'lost',
        lost_reason: 'Customer withdrew',
      });
      const quotation = await db.quotations.findOne(made.id, db.salesA);
      expect(quotation.current.status).toBe('customer_confirmed');
    });

    it('needs a reason, an open order and a request the actor can see', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      await expect(
        edit.cancel(order.id, { reason: '  ' }, db.manager),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        edit.cancel(order.id, { reason: 'x' }, db.salesB),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((await orders.findOne(order.id, db.salesA)).status).toBe('open');

      await edit.cancel(order.id, { reason: 'x' }, db.manager);
      await expect(
        edit.cancel(order.id, { reason: 'again' }, db.manager),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('a won request', () => {
    it('is ended only through its order: the request close and the quotation cancel refuse it', async () => {
      const made = await confirmed();
      await convert.convert({ quotationId: made.id }, db.salesA);

      await expect(
        db.requests.markLost(made.requestId, { reason: 'x' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        db.requests.cancel(made.requestId, { reason: 'x' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        db.approvals.cancel(made.id, { reason: 'x' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await requestRow(made.requestId)).status).toBe('won');
    });
  });

  describe('editing', () => {
    it('changes the contract number, contract date and delivery date while the order is open', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      const updated = await edit.update(
        order.id,
        { contractNo: ' HD-02 ', contractDate: '2027-01-20' },
        db.manager,
      );
      expect(updated).toMatchObject({
        contractNo: 'HD-02',
        contractDate: '2027-01-20',
        deliveryDate: null,
        total: order.total,
      });

      const cleared = await edit.update(
        order.id,
        { contractNo: null, deliveryDate: '2027-02-15' },
        db.manager,
      );
      expect(cleared).toMatchObject({
        contractNo: null,
        contractDate: '2027-01-20',
        deliveryDate: '2027-02-15',
      });
    });

    it('lets the sales owner edit its own order', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      const updated = await edit.update(
        order.id,
        { contractNo: 'HD-OWN' },
        db.salesA,
      );

      expect(updated.contractNo).toBe('HD-OWN');
    });

    it('records no timeline entry for an edit that changes nothing', async () => {
      const made = await confirmed();
      const order = await convert.convert(
        { quotationId: made.id, contractNo: 'HD-1' },
        db.salesA,
      );
      const entries = () =>
        db.dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM sales_request_activities WHERE request_id = $1 AND action = 'order_updated'`,
          [made.requestId],
        );

      await edit.update(order.id, { contractNo: ' HD-1 ' }, db.salesA);
      await edit.update(order.id, {}, db.salesA);
      expect((await entries())[0].count).toBe('0');

      await edit.update(order.id, { contractNo: 'HD-2' }, db.salesA);
      expect((await entries())[0].count).toBe('1');
    });

    it.each([
      [
        'edit',
        (id: number) => edit.update(id, { contractNo: 'X' }, db.manager),
      ],
      ['cancel', (id: number) => edit.cancel(id, { reason: 'x' }, db.manager)],
    ])(
      'refuses a %s whose order changed under the lock, and writes nothing',
      async (_name, act) => {
        const made = await confirmed();
        const order = await convert.convert(
          { quotationId: made.id },
          db.salesA,
        );
        const real = orderLock.lockOrder;
        // A writer that bypassed the lock: the row changes after this transaction read it.
        jest
          .spyOn(orderLock, 'lockOrder')
          .mockImplementation(async (manager, ...rest) => {
            const held = await real(manager, ...rest);
            await manager.query(
              `UPDATE sales_orders SET status = 'delivered' WHERE id = $1`,
              [order.id],
            );
            return held;
          });

        await expect(act(order.id)).rejects.toBeInstanceOf(ConflictException);

        const [row] = await db.dataSource.query<
          Array<{ status: string; contract_no: string | null }>
        >(`SELECT status, contract_no FROM sales_orders WHERE id = $1`, [
          order.id,
        ]);
        expect(row.status).toBe('open');
        expect(row.contract_no).toBeNull();
        expect((await requestRow(made.requestId)).status).toBe('won');
        const [{ count }] = await db.dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM sales_request_activities WHERE request_id = $1 AND action IN ('order_updated', 'order_cancelled')`,
          [made.requestId],
        );
        expect(count).toBe('0');
      },
    );

    it('answers 409 once the order is cancelled and 404 to another sales account', async () => {
      const made = await confirmed();
      const order = await convert.convert({ quotationId: made.id }, db.salesA);

      await expect(
        edit.update(order.id, { contractNo: 'x' }, db.salesB),
      ).rejects.toBeInstanceOf(NotFoundException);

      await edit.cancel(order.id, { reason: 'x' }, db.manager);
      await expect(
        edit.update(order.id, { contractNo: 'x' }, db.manager),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
