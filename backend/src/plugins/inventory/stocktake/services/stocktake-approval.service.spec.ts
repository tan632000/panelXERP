import { Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  describeWithDatabase,
  expectLedgerBalanced,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { STOCKTAKE_REFERENCE_CHECK } from '@plugins/inventory/stocktake/constants/stocktake.constant';
import {
  openStocktakeHarness,
  type StocktakeHarness,
} from '@plugins/inventory/stocktake/stocktake-db.helper-spec';

const exact = (text: string) => new Decimal(text).toFixed();

interface CountBody {
  id: number;
  code: string;
  status: string;
  lines: Array<{
    itemId: number;
    countedQty: number | null;
    bookQty: number | null;
    diff: number | null;
  }>;
}
const bodyOf = (res: { body: unknown }) => res.body as CountBody;

/**
 * Stock counts against the real Postgres of the compose stack, over HTTP: the task's worked
 * example step by step (book quantity at counting time, the refused approval, the recount, the
 * posted differences), the four-eyes rule, the open-count rule and what a storekeeper reads.
 */
describeWithDatabase('StocktakeApprovalService (real Postgres)', () => {
  jest.setTimeout(30_000);

  let h: StocktakeHarness;

  beforeAll(async () => {
    h = await openStocktakeHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  const stockOf = async (itemId: number) => {
    const totals = await h.db.totals(itemId);
    return { onHand: exact(totals.onHand), value: exact(totals.value) };
  };
  const lineOf = (body: CountBody, itemId: number) =>
    body.lines.find((line) => line.itemId === itemId);

  it('posts the differences against the book at counting time, only on approval (steps 1–5)', async () => {
    const a = await h.db.createItem({ referencePrice: 50000 });
    const b = await h.item();
    const c = await h.item();
    const d = await h.item();
    await h.stockOf(b, '10', 100000);
    await h.stockOf(c, '3', 1000);
    await h.stockOf(d, '5', 1000);

    const opened = await h.open(h.STOREKEEPER);
    expect(opened.status).toBe(201);
    const count = bodyOf(opened);
    expect(count.code).toMatch(/^KK_\d{4}_\d{4}$/);
    // A never moved: no line until it is scanned.
    expect(lineOf(count, a)).toBeUndefined();
    expect(lineOf(count, b)).toMatchObject({ countedQty: null, bookQty: null });

    // 1. A: scanned once (it gets a line), then counted 20 against a book of 0.
    await h.scan(h.STOREKEEPER, count.id, await h.codeOf(a)).expect(200);
    await h.count(h.STOREKEEPER, count.id, a, 20).expect(200);
    // 2. B counted 9 against 10; an issue of 2 then posts.
    await h.count(h.STOREKEEPER, count.id, b, 9).expect(200);
    await h.issue(b, '2');
    expect(await stockOf(b)).toEqual({ onHand: '8', value: '800000' });
    // 3. C counted 1 against 3; an issue of 2 then posts.
    await h.count(h.STOREKEEPER, count.id, c, 1).expect(200);
    await h.issue(c, '2');

    const counted = bodyOf(await h.get(h.STOREKEEPER, count.id).expect(200));
    expect(lineOf(counted, a)).toMatchObject({
      countedQty: 20,
      bookQty: 0,
      diff: 20,
    });
    expect(lineOf(counted, b)).toMatchObject({
      countedQty: 9,
      bookQty: 10,
      diff: -1,
    });
    expect(lineOf(counted, c)).toMatchObject({
      countedQty: 1,
      bookQty: 3,
      diff: -2,
    });
    expect(lineOf(counted, d)).toMatchObject({ countedQty: null, diff: null });

    // 4. C would go to 1 − 2 < 0: the whole count is refused, nothing posts.
    await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);
    const refused = await h.act(h.DIRECTOR, count.id, 'approve').expect(409);
    expect(String((refused.body as { message: unknown }).message)).toContain(
      await h.codeOf(c),
    );
    for (const item of [a, b, c, d]) expect(await h.movementsOf(item)).toBe(0);
    expect(await stockOf(b)).toEqual({ onHand: '8', value: '800000' });

    // 5. Rejected, C recounted against its book of now 1, resubmitted, approved.
    await h.act(h.DIRECTOR, count.id, 'reject', 'đếm lại C').expect(200);
    expect(bodyOf(await h.get(h.STOREKEEPER, count.id)).status).toBe(
      'counting',
    );
    await h.count(h.STOREKEEPER, count.id, c, 1).expect(200);
    await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);
    const approved = await h.act(h.DIRECTOR, count.id, 'approve').expect(200);
    expect(bodyOf(approved).status).toBe('approved');

    // A: opening balance at its reference price; B: −1 at the average 100 000.
    expect(await stockOf(a)).toEqual({ onHand: '20', value: '1000000' });
    expect(await stockOf(b)).toEqual({ onHand: '7', value: '700000' });
    expect(await h.movementsOf(c)).toBe(0);
    expect(await h.movementsOf(d)).toBe(0);
    for (const item of [a, b, c, d]) await expectLedgerBalanced(h.db, item);
  });

  it('refuses approval to everyone who took part: counter, submitter, any earlier counter (step 6)', async () => {
    const x = await h.item();
    await h.stockOf(x, '4', 1000);
    const count = bodyOf(await h.open(h.STOREKEEPER));
    // An admin saves a count, then the storekeeper recounts the same line after them.
    const COUNTING_ADMIN = await h.as('sales_mgr', 'admin');
    await h.count(COUNTING_ADMIN, count.id, x, 3).expect(200);
    await h.count(h.STOREKEEPER, count.id, x, 4).expect(200);
    // Someone else submits.
    const submitter = await h.as('sales_b', 'storekeeper');
    await h.act(submitter, count.id, 'submit').expect(200);
    const submitterAsAdmin = await h.as('sales_b', 'admin');
    const storekeeperAsAdmin = await h.as('storekeeper', 'admin');

    await h.act(storekeeperAsAdmin, count.id, 'approve').expect(403);
    await h.act(submitterAsAdmin, count.id, 'approve').expect(403);
    // Not the last counter of the line, still a counter.
    await h.act(COUNTING_ADMIN, count.id, 'approve').expect(403);
    await h.act(h.STOREKEEPER, count.id, 'cancel', 'Thử quyền').expect(200);
  });

  it('bars a creator who neither counted nor submitted, and a counter from rejecting', async () => {
    const x = await h.item();
    await h.stockOf(x, '2', 1000);
    // sales_a only opens the count; the storekeeper counts and submits.
    const creator = await h.as('sales_a', 'storekeeper');
    const count = bodyOf(await h.open(creator));
    await h.count(h.STOREKEEPER, count.id, x, 2).expect(200);
    await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);

    await h
      .act(await h.as('sales_a', 'admin'), count.id, 'approve')
      .expect(403);
    await h
      .act(await h.as('storekeeper', 'admin'), count.id, 'reject', 'Đếm lại')
      .expect(403);
    // Someone who took no part may still decide.
    await h.act(h.DIRECTOR, count.id, 'reject', 'Đếm lại').expect(200);
    await h.act(h.STOREKEEPER, count.id, 'cancel', 'Thử quyền').expect(200);
  });

  describe('the director deciding on a count', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    /** Runs the real transaction between `before` and `after`; `once` leaves later calls alone. */
    const aroundTransaction = (
      hooks: { before?: () => Promise<void>; after?: () => unknown },
      once = false,
    ) => {
      const real = h.db.dataSource.transaction.bind(
        h.db.dataSource,
      ) as unknown as (...args: unknown[]) => Promise<unknown>;
      const around = (async (...args: unknown[]) => {
        await hooks.before?.();
        const result = await real(...args);
        hooks.after?.();
        return result;
      }) as never;
      const spy = jest.spyOn(h.db.dataSource, 'transaction');
      return once
        ? spy.mockImplementationOnce(around)
        : spy.mockImplementation(around);
    };
    const noticesOf = (stocktakeId: number) =>
      h.db.dataSource.query<
        Array<{
          event_type: string;
          role_codes: string[];
          exclude_user_ids: number[];
          required_scope: string;
          link: string;
          payload: { stocktakeId: number; code: string };
        }>
      >(
        `SELECT event_type, role_codes, exclude_user_ids, required_scope, link, payload
           FROM notifications
          WHERE event_type LIKE 'inventory.stocktake.%'
            AND (payload->>'stocktakeId')::int = $1 ORDER BY id`,
        [stocktakeId],
      );
    const movementsOfCount = async (stocktakeId: number) => {
      const [row]: Array<{ count: string }> = await h.db.dataSource.query(
        `SELECT COUNT(*) AS count FROM stock_movements
          WHERE document_type = 'stocktake' AND document_id = $1
            AND movement_type = 'count_adjustment'`,
        [stocktakeId],
      );
      return Number(row.count);
    };
    const headerOf = async (stocktakeId: number) => {
      const [row]: Array<{
        status: string;
        approved_by: number | null;
        submitted_by: number | null;
      }> = await h.db.dataSource.query(
        `SELECT status, approved_by, submitted_by FROM stocktakes WHERE id = $1`,
        [stocktakeId],
      );
      return row;
    };

    it('approves and posts in the submit request: one movement per changed line, and tells the storekeeper and purchasing', async () => {
      const directorId = await h.db.userId('director');
      const shortfall = await h.item();
      const gain = await h.item();
      const same = await h.item();
      await h.stockOf(shortfall, '5', 1000);
      await h.stockOf(gain, '2', 1000);
      await h.stockOf(same, '4', 1000);

      const count = bodyOf(await h.open(h.DIRECTOR));
      await h.count(h.DIRECTOR, count.id, shortfall, 3).expect(200);
      await h.count(h.DIRECTOR, count.id, gain, 4).expect(200);
      await h.count(h.DIRECTOR, count.id, same, 4).expect(200);
      const res = await h.act(h.DIRECTOR, count.id, 'submit').expect(200);

      expect(bodyOf(res).status).toBe('approved');
      expect(await headerOf(count.id)).toMatchObject({
        status: 'approved',
        approved_by: directorId,
        submitted_by: directorId,
      });
      expect(await stockOf(shortfall)).toMatchObject({ onHand: '3' });
      expect(await stockOf(gain)).toMatchObject({ onHand: '4' });
      expect(await stockOf(same)).toMatchObject({ onHand: '4' });
      expect(await h.movementsOf(shortfall)).toBe(1);
      expect(await h.movementsOf(gain)).toBe(1);
      expect(await h.movementsOf(same)).toBe(0);
      expect(await movementsOfCount(count.id)).toBe(2);
      for (const item of [shortfall, gain, same]) {
        await expectLedgerBalanced(h.db, item);
      }

      const notices = await noticesOf(count.id);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        event_type: 'inventory.stocktake.approved',
        exclude_user_ids: [directorId],
        required_scope: 'stocktake:read',
        link: `/inventory/stocktakes/${count.id}`,
        payload: { stocktakeId: count.id, code: count.code },
      });
      expect([...notices[0].role_codes].sort()).toEqual([
        'purchasing',
        'storekeeper',
      ]);
    });

    it('refuses a director count that would go below zero with 409 and leaves it counting', async () => {
      const x = await h.item();
      await h.stockOf(x, '3', 1000);
      const count = bodyOf(await h.open(h.DIRECTOR));
      await h.count(h.DIRECTOR, count.id, x, 1).expect(200);
      await h.issue(x, '2');

      const refused = await h.act(h.DIRECTOR, count.id, 'submit').expect(409);

      expect(String((refused.body as { message: unknown }).message)).toContain(
        await h.codeOf(x),
      );
      expect((await headerOf(count.id)).status).toBe('counting');
      expect(await movementsOfCount(count.id)).toBe(0);
      expect(await noticesOf(count.id)).toHaveLength(0);
      await h.act(h.DIRECTOR, count.id, 'cancel', 'Thử').expect(200);
    });

    it('sends the notice only after the transaction has committed', async () => {
      const x = await h.item();
      await h.stockOf(x, '3', 1000);
      const count = bodyOf(await h.open(h.DIRECTOR));
      await h.count(h.DIRECTOR, count.id, x, 2).expect(200);

      const emit = jest.spyOn(h.notifications, 'emit');
      const emitsWhenResolved: number[] = [];
      aroundTransaction({
        after: () => emitsWhenResolved.push(emit.mock.calls.length),
      });

      await h.act(h.DIRECTOR, count.id, 'submit').expect(200);

      expect(emitsWhenResolved).toEqual([0]);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(await noticesOf(count.id)).toHaveLength(1);
    });

    it('answers 409 and sends nothing when a cancel commits first', async () => {
      const x = await h.item();
      await h.stockOf(x, '3', 1000);
      const count = bodyOf(await h.open(h.DIRECTOR));
      await h.count(h.DIRECTOR, count.id, x, 2).expect(200);

      aroundTransaction(
        {
          before: async () => {
            await h.act(h.STOREKEEPER, count.id, 'cancel', 'Hủy').expect(200);
          },
        },
        true,
      );

      await h.act(h.DIRECTOR, count.id, 'submit').expect(409);

      expect((await headerOf(count.id)).status).toBe('cancelled');
      expect(await movementsOfCount(count.id)).toBe(0);
      expect(await noticesOf(count.id)).toHaveLength(0);
    });

    it('lets the director approve a count they took part in, refuses the admin who did, and tells the stores', async () => {
      const directorId = await h.db.userId('director');
      const a = await h.item();
      const b = await h.item();
      await h.stockOf(a, '4', 1000);
      await h.stockOf(b, '4', 1000);
      const count = bodyOf(await h.open(h.STOREKEEPER));
      const countingAdmin = await h.as('sales_mgr', 'admin');
      await h.count(countingAdmin, count.id, a, 3).expect(200);
      await h.count(h.DIRECTOR, count.id, b, 5).expect(200);
      await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);

      await h.act(countingAdmin, count.id, 'approve').expect(403);
      expect(await noticesOf(count.id)).toHaveLength(0);
      const approved = await h.act(h.DIRECTOR, count.id, 'approve').expect(200);

      expect(bodyOf(approved).status).toBe('approved');
      const notices = await noticesOf(count.id);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        event_type: 'inventory.stocktake.approved',
        exclude_user_ids: [directorId],
      });
      expect(await movementsOfCount(count.id)).toBe(2);
    });

    it('tells the stores when someone other than the director approves', async () => {
      const approverId = await h.db.userId('sales_b');
      const x = await h.item();
      await h.stockOf(x, '3', 1000);
      const count = bodyOf(await h.open(h.STOREKEEPER));
      await h.count(h.STOREKEEPER, count.id, x, 2).expect(200);
      await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);

      await h
        .act(await h.as('sales_b', 'admin'), count.id, 'approve')
        .expect(200);

      const notices = await noticesOf(count.id);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ exclude_user_ids: [approverId] });
    });

    it('keeps the approval when the notice cannot be sent', async () => {
      const x = await h.item();
      await h.stockOf(x, '3', 1000);
      const count = bodyOf(await h.open(h.STOREKEEPER));
      await h.count(h.STOREKEEPER, count.id, x, 2).expect(200);
      await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);
      jest
        .spyOn(h.notifications, 'emit')
        .mockRejectedValue(new Error('notification table unavailable'));
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await h.act(h.DIRECTOR, count.id, 'approve').expect(200);

      expect(logged).toHaveBeenCalledTimes(1);
      expect((await headerOf(count.id)).status).toBe('approved');
      expect(await movementsOfCount(count.id)).toBe(1);
    });
  });

  it('keeps one count open at a time, counts only while counting, and vetoes deleting its items', async () => {
    const x = await h.item();
    await h.stockOf(x, '2', 1000);
    const count = bodyOf(await h.open(h.STOREKEEPER));
    expect((await h.open(h.STOREKEEPER)).status).toBe(409);

    // A storekeeper reads book quantities and differences, never a cost.
    await h.count(h.STOREKEEPER, count.id, x, 1).expect(200);
    const read = await h.get(h.STOREKEEPER, count.id).expect(200);
    expect(lineOf(bodyOf(read), x)).toMatchObject({ bookQty: 2, diff: -1 });
    expectNoMoneyKeys(read.body);

    expect(await h.itemChecks.referencingItem(x)).toContain(
      STOCKTAKE_REFERENCE_CHECK,
    );
    await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);
    await h.scan(h.STOREKEEPER, count.id, await h.codeOf(x)).expect(409);
    await h.count(h.STOREKEEPER, count.id, x, 2).expect(409);

    await h.act(h.STOREKEEPER, count.id, 'cancel', 'Thử').expect(200);
    expect(await h.itemChecks.referencingItem(x)).not.toContain(
      STOCKTAKE_REFERENCE_CHECK,
    );
    expect(await h.movementsOf(x)).toBe(0);
  });
});
