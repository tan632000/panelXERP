import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import {
  openAcceptanceHarness,
  type AcceptanceHarness,
} from '@plugins/delivery/acceptance/acceptance-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

const ORDER_LOCK = `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE`;

/**
 * Acceptance writes against each other and against the installation create at the same moment,
 * on the real Postgres of the compose stack. A holder keeps the order row while every contender
 * queues behind it, so they run one after the other in the order they were started; each must
 * see what the one before committed.
 */
describeWithDatabase('Acceptance races (real Postgres)', () => {
  jest.setTimeout(180_000);

  let d: AcceptanceHarness;

  beforeAll(async () => {
    d = await openAcceptanceHarness();
  });

  afterAll(async () => {
    await d?.close();
  });

  beforeEach(() => {
    d.storage.objects.clear();
  });

  const race = async (
    orderId: number,
    contenders: Array<() => Promise<number>>,
  ) =>
    (await queuedBehind(d.h.dataSource, ORDER_LOCK, [orderId], contenders)).map(
      (outcome) => (outcome.status === 'fulfilled' ? outcome.value : -1),
    );
  /** A contender: the request is built and sent only when the race starts it. */
  const status = (send: () => PromiseLike<{ status: number }>) => async () =>
    (await send()).status;

  const installationRows = async (orderId: number) => {
    const [row]: Array<{ n: string }> = await d.h.dataSource.query(
      `SELECT COUNT(*) AS n FROM installations WHERE order_id = $1`,
      [orderId],
    );
    return Number(row.n);
  };

  it('never leaves an order completed beside an installation that is not done: installation create first', async () => {
    const orderId = await d.deliveredOrder();

    const results = await race(orderId, [
      status(() => d.createInstallation(orderId)),
      status(() => d.accept(orderId)),
    ]);

    expect(results).toEqual([201, 409]);
    expect(await d.h.statusOfOrder(orderId)).toBe('delivered');
    expect(await d.acceptanceRows(orderId)).toBe(0);
    expect(await installationRows(orderId)).toBe(1);
    expect(d.storage.objects.size).toBe(0);
  });

  it('never leaves an order completed beside an installation that is not done: acceptance first', async () => {
    const orderId = await d.deliveredOrder();

    const results = await race(orderId, [
      status(() => d.accept(orderId)),
      status(() => d.createInstallation(orderId)),
    ]);

    expect(results).toEqual([201, 409]);
    expect(await d.h.statusOfOrder(orderId)).toBe('completed');
    expect(await d.acceptanceRows(orderId)).toBe(1);
    expect(await installationRows(orderId)).toBe(0);
  });

  it('lets one of two acceptances queued for one order win and moves the order once', async () => {
    const orderId = await d.deliveredOrder();
    const move = jest.spyOn(d.h.app.get(OrderProductionPort), 'moveStatus');
    try {
      const results = await race(orderId, [
        status(() => d.accept(orderId)),
        status(() => d.accept(orderId)),
      ]);

      expect(results).toEqual([201, 409]);
      expect(move).toHaveBeenCalledTimes(1);
      expect(move).toHaveBeenCalledWith(
        expect.anything(),
        orderId,
        'delivered',
        'completed',
      );
    } finally {
      move.mockRestore();
    }
    expect(await d.h.statusOfOrder(orderId)).toBe('completed');
    expect(await d.acceptanceRows(orderId)).toBe(1);
    // The loser stored its object before it met the lock; it must not be left behind.
    expect(d.storage.objects.size).toBe(1);
  });
});
