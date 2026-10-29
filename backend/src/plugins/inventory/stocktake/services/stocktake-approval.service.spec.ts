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
    // A director saves a count, then the storekeeper recounts the same line after them.
    const COUNTING_DIRECTOR = await h.as('sales_mgr', 'director');
    await h.count(COUNTING_DIRECTOR, count.id, x, 3).expect(403);
    const directorWhoCounts = JSON.stringify({
      ...(JSON.parse(COUNTING_DIRECTOR) as Record<string, unknown>),
      permissions: [
        ...(JSON.parse(COUNTING_DIRECTOR) as { permissions: string[] })
          .permissions,
        'stocktake:update',
      ],
    });
    await h.count(directorWhoCounts, count.id, x, 3).expect(200);
    await h.count(h.STOREKEEPER, count.id, x, 4).expect(200);
    // Someone else submits.
    const submitter = await h.as('sales_b', 'storekeeper');
    await h.act(submitter, count.id, 'submit').expect(200);
    const submitterAsDirector = await h.as('sales_b', 'director');
    const storekeeperAsDirector = await h.as('storekeeper', 'director');

    await h.act(storekeeperAsDirector, count.id, 'approve').expect(403);
    await h.act(submitterAsDirector, count.id, 'approve').expect(403);
    // Not the last counter of the line, still a counter.
    await h.act(COUNTING_DIRECTOR, count.id, 'approve').expect(403);
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
      .act(await h.as('sales_a', 'director'), count.id, 'approve')
      .expect(403);
    await h
      .act(await h.as('storekeeper', 'director'), count.id, 'reject', 'Đếm lại')
      .expect(403);
    // Someone who took no part may still decide.
    await h.act(h.DIRECTOR, count.id, 'reject', 'Đếm lại').expect(200);
    await h.act(h.STOREKEEPER, count.id, 'cancel', 'Thử quyền').expect(200);
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
