import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import {
  openDeliveryHarness,
  type DeliveryHarness,
} from '@plugins/delivery/delivery-note/delivery-note-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

const ORDER_LOCK = `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE`;

/**
 * Delivery writes against each other at the same moment, on the real Postgres of the compose
 * stack. A holder keeps the order row while every contender queues behind it, so they run one
 * after the other in the order they were started; each must see what the one before committed.
 */
describeWithDatabase('Delivery note races (real Postgres)', () => {
  jest.setTimeout(180_000);

  let d: DeliveryHarness;

  beforeAll(async () => {
    d = await openDeliveryHarness();
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

  it('lets the first of two creates naming one cabinet win; the second sees the note and answers 400', async () => {
    const f = await d.readyOrder({ finished: 1 });
    const create = status(() =>
      d.create({ orderId: f.orderId, unitIds: f.passedUnitIds }),
    );

    expect(await race(f.orderId, [create, create])).toEqual([201, 400]);

    const [row]: Array<{ n: string }> = await d.h.dataSource.query(
      `SELECT COUNT(*) AS n FROM delivery_note_units WHERE unit_id = ANY($1) AND active`,
      [f.passedUnitIds],
    );
    expect(Number(row.n)).toBe(1);
  });

  it('delivers the order exactly once when the receipts of the last two shipped notes race', async () => {
    const f = await d.readyOrder({ finished: 2 });
    const first = await d.shippedNote(f.orderId, [f.unitIds[0]]);
    const second = await d.shippedNote(f.orderId, [f.unitIds[1]]);

    expect(
      await race(f.orderId, [
        status(() => d.receive(first.id)),
        status(() => d.receive(second.id)),
      ]),
    ).toEqual([200, 200]);

    expect(await d.h.statusOfOrder(f.orderId)).toBe('delivered');
    const changes = await d.changes('salesA', f.orderId);
    expect(changes.filter((change) => change === 'delivered')).toHaveLength(1);
    expect(
      changes.filter((change) => change === 'delivery_received'),
    ).toHaveLength(1);
  });

  it.each([
    ['receive first', true],
    ['cancel first', false],
  ])(
    'lets exactly one of a receive and a cancel of one note succeed (%s)',
    async (_label, receiveFirst) => {
      const f = await d.readyOrder({ finished: 1 });
      const note = await d.shippedNote(f.orderId, f.passedUnitIds);
      const receive = status(() => d.receive(note.id));
      const cancel = status(() => d.cancel(note.id));

      const results = await race(
        f.orderId,
        receiveFirst ? [receive, cancel] : [cancel, receive],
      );

      expect(results).toEqual([200, 409]);
      expect(await d.statusOfNote(note.id)).toBe(
        receiveFirst ? 'received' : 'cancelled',
      );
      // A receipt that lost must not leave its file behind.
      expect(d.storage.objects.size).toBe(receiveFirst ? 1 : 0);
    },
  );

  it('backs the rule with a unique index: a second active line for one cabinet is refused by the database', async () => {
    const f = await d.readyOrder({ finished: 1 });
    const note = await d.shippedNote(f.orderId, f.passedUnitIds);

    await expect(
      d.h.dataSource.query(
        `INSERT INTO delivery_note_units (note_id, unit_id, unit_code)
         VALUES ($1, $2, 'duplicate')`,
        [note.id, f.passedUnitIds[0]],
      ),
    ).rejects.toMatchObject({
      driverError: { constraint: 'uq_delivery_note_units_active' },
    });
  });
});
