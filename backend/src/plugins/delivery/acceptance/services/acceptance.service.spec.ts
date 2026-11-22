import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  JPEG,
  PDF,
  PNG,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openAcceptanceHarness,
  type AcceptanceHarness,
} from '@plugins/delivery/acceptance/acceptance-db.helper-spec';
import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

interface AcceptanceBody {
  id: number;
  orderId: number;
  representativeName: string;
  signedDate: string;
  files: Array<{ id: number; fileName: string; contentType: string }>;
}

/** Calendar date arithmetic on a `YYYY-MM-DD` text, in UTC so no zone shifts it. */
function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/**
 * The acceptance minutes against the real Postgres of the compose stack: the order and
 * installation gates, the date bounds, who may create and read, scope before status before any
 * stored object, the follower notice and the cleanup of stored files.
 */
describeWithDatabase('AcceptanceService (real Postgres)', () => {
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
    d.storage.upload.mockClear();
    d.storage.deleteObject.mockClear();
  });

  const body = (res: { body: unknown }) => res.body as AcceptanceBody;

  describe('the gates', () => {
    it('refuses an order that is not delivered with 409 and stores nothing', async () => {
      for (const status of ['open', 'in_production', 'cancelled']) {
        const orderId = await d.orderIn(status);

        await d.accept(orderId).expect(409);

        expect(await d.h.statusOfOrder(orderId)).toBe(status);
        expect(await d.acceptanceRows(orderId)).toBe(0);
      }
      expect(d.storage.objects.size).toBe(0);
    });

    it.each(['planned', 'in_progress'])(
      'refuses a delivered order whose installation is %s',
      async (status) => {
        const orderId = await d.deliveredOrder();
        await d.addInstallation(orderId, status);

        await d.accept(orderId).expect(409);

        expect(await d.h.statusOfOrder(orderId)).toBe('delivered');
        expect(await d.acceptanceRows(orderId)).toBe(0);
        expect(d.storage.objects.size).toBe(0);
      },
    );

    it('completes a delivered order without an installation', async () => {
      const orderId = await d.deliveredOrder();

      const res = await d
        .accept(orderId, {
          representativeName: '  Lê Văn C  ',
          signedDate: '2020-01-31',
          files: [
            { name: 'bien-ban.PDF', bytes: PDF },
            { name: 'anh.jpeg', bytes: JPEG },
          ],
        })
        .expect(201);

      expect(body(res)).toMatchObject({
        orderId,
        representativeName: 'Lê Văn C',
        signedDate: '2020-01-31',
      });
      expect(body(res).files.map((f) => f.contentType)).toEqual([
        'application/pdf',
        'image/jpeg',
      ]);
      expect(await d.h.statusOfOrder(orderId)).toBe('completed');
    });

    it('completes a delivered order whose installation is done', async () => {
      const orderId = await d.deliveredOrder();
      await d.addInstallation(orderId, 'done');

      await d.accept(orderId).expect(201);

      expect(await d.h.statusOfOrder(orderId)).toBe('completed');
    });

    it('allows one acceptance per order: a second answers 409', async () => {
      const { orderId } = await d.accepted();
      d.storage.objects.clear();

      await d.accept(orderId).expect(409);

      expect(await d.acceptanceRows(orderId)).toBe(1);
      expect(d.storage.objects.size).toBe(0);
    });

    it('refuses minutes that already exist on a delivered order, and backs it with a unique index', async () => {
      const orderId = await d.deliveredOrder();
      await d.accept(orderId).expect(201);
      await d.h.dataSource.query(
        `UPDATE sales_orders SET status = 'delivered' WHERE id = $1`,
        [orderId],
      );

      await d.accept(orderId).expect(409);
      await expect(
        d.h.dataSource.query(
          `INSERT INTO acceptances (order_id, representative_name, signed_date)
           VALUES ($1, 'Dup', CURRENT_DATE)`,
          [orderId],
        ),
      ).rejects.toMatchObject({
        driverError: { constraint: 'uq_acceptances_order' },
      });
    });

    it('answers 404 to an order that does not exist and stores nothing', async () => {
      await d.accept(2147483000).expect(404);

      expect(d.storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('the dates', () => {
    it('refuses a signed date after the Vietnam today and accepts today', async () => {
      const orderId = await d.deliveredOrder();

      await d
        .accept(orderId, { signedDate: addDays(vnToday(), 1) })
        .expect(400);
      expect(d.storage.objects.size).toBe(0);
      expect(await d.h.statusOfOrder(orderId)).toBe('delivered');

      await d.accept(orderId, { signedDate: vnToday() }).expect(201);
    });

    it('refuses a signed date one day before the latest receipt and accepts the same day', async () => {
      const received = addDays(vnToday(), -3);
      const orderId = await d.deliveredOrder(received);
      // An earlier receipt must not lower the bound.
      await d.h.dataSource.query(
        `INSERT INTO delivery_notes (code, order_id, status, received_date)
         VALUES ($1, $2, 'received', $3)`,
        [`PGH_ACC_${orderId}_early`, orderId, addDays(received, -10)],
      );

      await d
        .accept(orderId, { signedDate: addDays(received, -1) })
        .expect(400);
      expect(d.storage.objects.size).toBe(0);
      expect(await d.acceptanceRows(orderId)).toBe(0);

      await d.accept(orderId, { signedDate: received }).expect(201);
    });

    it('refuses a missing or malformed name, date or file set with 400', async () => {
      const orderId = await d.deliveredOrder();

      await d.accept(orderId, { representativeName: '   ' }).expect(400);
      await d
        .accept(orderId, { representativeName: 'x'.repeat(256) })
        .expect(400);
      await d.accept(orderId, { signedDate: 'yesterday' }).expect(400);
      await d.accept(orderId, { files: [] }).expect(400);
      await d
        .accept(orderId, { files: [{ name: 'a.png', bytes: PDF }] })
        .expect(400);
      await d
        .accept(orderId, { files: [{ name: 'a.txt', bytes: PNG }] })
        .expect(400);

      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.h.statusOfOrder(orderId)).toBe('delivered');
    });
  });

  describe('who may', () => {
    it('lets the sales owner and a sales manager create, whatever the owner', async () => {
      const own = await d.deliveredOrder();
      const other = await d.deliveredOrder();

      await d.accept(own, {}, 'salesA').expect(201);
      await d.accept(other, {}, 'salesMgr').expect(201);

      expect(await d.h.statusOfOrder(own)).toBe('completed');
      expect(await d.h.statusOfOrder(other)).toBe('completed');
    });

    it('refuses the storekeeper and a technician with 403, and lets the storekeeper read', async () => {
      const orderId = await d.deliveredOrder();

      await d.accept(orderId, {}, 'storekeeper').expect(403);
      await d.accept(orderId, {}, 'techA').expect(403);
      expect(d.storage.upload).not.toHaveBeenCalled();
      await d.accept(orderId, {}, 'salesA').expect(201);

      await d
        .get(`/delivery/orders/${orderId}/acceptance`, 'storekeeper')
        .expect(200);
      await d
        .get(`/delivery/orders/${orderId}/acceptance`, 'techA')
        .expect(403);
    });

    it('answers 404 to another sales rep before any status answer and stores nothing', async () => {
      const inProduction = await d.orderIn('in_production');
      const delivered = await d.deliveredOrder();

      await d.accept(inProduction, {}, 'salesB').expect(404);
      await d.accept(delivered, {}, 'salesB').expect(404);

      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.h.statusOfOrder(delivered)).toBe('delivered');
      await d
        .get(`/delivery/orders/${delivered}/acceptance`, 'salesB')
        .expect(404);
    });
  });

  describe('reads', () => {
    it('answers 200 with a JSON null while a visible order has no minutes', async () => {
      const orderId = await d.deliveredOrder();

      const res = await d
        .get(`/delivery/orders/${orderId}/acceptance`)
        .expect(200);

      expect(res.text).toBe('null');
      expect(res.body).toBeNull();
    });

    it('returns the minutes with their files, with no storage key and no money key', async () => {
      const { orderId } = await d.accepted();

      const res = await d
        .get(`/delivery/orders/${orderId}/acceptance`, 'salesMgr')
        .expect(200);

      expect(body(res)).toMatchObject({
        orderId,
        files: [{ fileName: 'minutes.pdf' }],
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /storage|delivery\/acceptance/i,
      );
      expectNoMoneyKeys(res.body);
    });
  });

  describe('the notice', () => {
    it('tells the followers once that the order is completed', async () => {
      const orderId = await d.deliveredOrder();
      await d.accept(orderId, {}, 'salesMgr').expect(201);

      const owner = await d.changes('salesA', orderId);
      const warehouse = await d.changes('storekeeper', orderId);

      expect(owner.filter((change) => change === 'completed')).toHaveLength(1);
      expect(warehouse.filter((change) => change === 'completed')).toHaveLength(
        1,
      );
    });
  });

  describe('the stored files', () => {
    it('deletes every object and writes no row when the storage fails after the first of two files', async () => {
      const orderId = await d.deliveredOrder();
      const store = d.storage.upload.getMockImplementation();
      if (!store) throw new Error('The storage fake has no implementation.');
      d.storage.upload
        .mockImplementationOnce(store)
        .mockImplementationOnce(() =>
          Promise.reject(new Error('Storage down')),
        );

      await d
        .accept(orderId, {
          files: [
            { name: 'a.pdf', bytes: PDF },
            { name: 'b.png', bytes: PNG },
          ],
        })
        .expect(500);

      expect(d.storage.upload).toHaveBeenCalledTimes(2);
      expect(d.storage.deleteObject).toHaveBeenCalledTimes(2);
      expect(d.storage.objects.size).toBe(0);
      expect(await d.acceptanceRows(orderId)).toBe(0);
      expect(await d.h.statusOfOrder(orderId)).toBe('delivered');
    });

    it('stores each file under a random key of the order', async () => {
      const orderId = await d.deliveredOrder();

      await d
        .accept(orderId, {
          files: [
            { name: 'a.pdf', bytes: PDF },
            { name: 'b.jpg', bytes: JPEG },
          ],
        })
        .expect(201);

      const keys = [...d.storage.objects.keys()];
      expect(keys).toHaveLength(2);
      for (const key of keys) {
        expect(key).toMatch(
          new RegExp(
            `^delivery/acceptance/${orderId}/[0-9a-f-]{36}\\.(pdf|png|jpg)$`,
          ),
        );
      }
    });
  });
});
