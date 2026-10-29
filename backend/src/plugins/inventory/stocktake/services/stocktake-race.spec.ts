import { Decimal } from 'decimal.js';

import {
  describeWithDatabase,
  expectLedgerBalanced,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  openStocktakeHarness,
  type StocktakeHarness,
} from '@plugins/inventory/stocktake/stocktake-db.helper-spec';

/**
 * Stock counts racing each other, an issue and a cancel on the real Postgres of the compose
 * stack. The suite takes its turn on the one-open-count rule with the approval suite.
 */
describeWithDatabase('Stocktake races (real Postgres)', () => {
  jest.setTimeout(30_000);

  let h: StocktakeHarness;

  beforeAll(async () => {
    h = await openStocktakeHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  it('(a) lets only one of two concurrent creates open a count', async () => {
    const results = await Promise.all([
      h.open(h.STOREKEEPER),
      h.open(h.STOREKEEPER),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const opened = results.find((res) => res.status === 201);
    await h
      .act(h.STOREKEEPER, (opened?.body as { id: number }).id, 'cancel', 'Thử')
      .expect(200);
  });

  it('(b) keeps the ledger whole when an approval races an issue of the same item', async () => {
    const b = await h.item();
    await h.stockOf(b, '10', 100000);
    const count = (await h.open(h.STOREKEEPER)).body as { id: number };
    await h.count(h.STOREKEEPER, count.id, b, 9).expect(200);
    await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);

    const [approval, issue] = await Promise.allSettled([
      h.act(h.DIRECTOR, count.id, 'approve'),
      h.issue(b, '2'),
    ]);

    expect(approval.status === 'fulfilled' && approval.value.status).toBe(200);
    expect(issue.status).toBe('fulfilled');
    // Book 10 at counting, −1 found missing, −2 issued after counting.
    const balance = await h.kit.balanceOf(b);
    expect(balance.onHand).toBe('7');
    expect(
      new Decimal(balance.reserved).lessThanOrEqualTo(balance.onHand),
    ).toBe(true);
    await expectLedgerBalanced(h.db, b);
  });

  it('(c) lets exactly one of an approval and a cancel through', async () => {
    const x = await h.item();
    await h.stockOf(x, '3', 1000);
    const count = (await h.open(h.STOREKEEPER)).body as { id: number };
    await h.count(h.STOREKEEPER, count.id, x, 2).expect(200);
    await h.act(h.STOREKEEPER, count.id, 'submit').expect(200);

    const results = await Promise.all([
      h.act(h.DIRECTOR, count.id, 'approve'),
      h.act(h.STOREKEEPER, count.id, 'cancel', 'Huỷ thử'),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const [state]: Array<{ status: string }> = await h.db.dataSource.query(
      `SELECT status FROM stocktakes WHERE id = $1`,
      [count.id],
    );
    const posted = await h.movementsOf(x);
    // Approved and posted, or cancelled and nothing posted: never both, never neither.
    expect(
      (state.status === 'approved' && posted === 1) ||
        (state.status === 'cancelled' && posted === 0),
    ).toBe(true);
  });
});
