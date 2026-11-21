import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import { PNG } from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openQcHarness,
  type QcHarness,
} from '@plugins/delivery/qc-inspection/qc-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

const HEADER_LOCK = `SELECT id FROM production_orders WHERE id = $1 FOR UPDATE`;
const PHOTO = { name: 'finish.png', bytes: PNG };

/**
 * QC photo uploads against the real Postgres of the compose stack, over a storage fake: the
 * per-round count under the production locks, the object removed when the row is not written, and
 * nothing stored for a request that is refused first.
 */
describeWithDatabase('QC photo service (real Postgres)', () => {
  jest.setTimeout(90_000);

  let qc: QcHarness;

  beforeAll(async () => {
    qc = await openQcHarness();
  });

  afterAll(async () => {
    await qc?.close();
  });

  beforeEach(() => {
    qc.storage.upload.mockClear();
    qc.storage.deleteObject.mockClear();
    qc.storage.objects.clear();
  });

  /** A cabinet with a recorded round, and the id of one of its round items. */
  const roundedUnit = async () => {
    const ready = await qc.readyUnit();
    await qc.submit(ready.unitId, {}, 'qcInspector', 201);
    return { ...ready, itemId: await qc.roundItemId(ready.unitId) };
  };

  /** Fills the round of the item with photo rows, without going through storage. */
  const fill = (itemId: number, count: number) =>
    qc.h.dataSource.query(
      `INSERT INTO qc_photos (round_item_id, storage_key, content_type, file_name, size_bytes)
       SELECT $1, 'delivery/qc-photo/seed/' || n || '.png', 'image/png', 'seed.png', 4
         FROM generate_series(1, $2::int) AS n`,
      [itemId, count],
    );

  it('stores the object and the row, and answers without the storage key', async () => {
    const { itemId } = await roundedUnit();

    const res = await qc.photo(itemId, PHOTO).expect(201);

    expect(res.body).toMatchObject({
      roundItemId: itemId,
      fileName: 'finish.png',
      contentType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey|storage_key/);
    expect(qc.storage.upload).toHaveBeenCalledTimes(1);
    expect(await qc.photoRows(itemId)).toBe(1);
  });

  it('refuses the 31st photo of a round (400), removes the object it stored and writes no row', async () => {
    const { itemId } = await roundedUnit();
    await fill(itemId, 30);

    await qc.photo(itemId, PHOTO).expect(400);

    expect(qc.storage.upload).toHaveBeenCalledTimes(1);
    const storedKey = qc.storage.upload.mock.calls[0][0];
    expect(qc.storage.deleteObject).toHaveBeenCalledWith(storedKey);
    expect(qc.storage.objects.size).toBe(0);
    expect(await qc.photoRows(itemId)).toBe(30);
  });

  it('lets one of two uploads queued behind the production header row take the 30th place', async () => {
    const ready = await qc.readyUnit();
    await qc.submit(ready.unitId, {}, 'qcInspector', 201);
    const itemId = await qc.roundItemId(ready.unitId);
    await fill(itemId, 29);

    const settled = await queuedBehind(
      qc.h.dataSource,
      HEADER_LOCK,
      [ready.id],
      [
        async () => (await qc.photo(itemId, PHOTO)).status,
        async () => (await qc.photo(itemId, PHOTO)).status,
      ],
    );

    expect(
      settled.map((outcome) =>
        outcome.status === 'fulfilled' ? outcome.value : -1,
      ),
    ).toEqual([201, 400]);
    expect(await qc.photoRows(itemId)).toBe(30);
    expect(qc.storage.objects.size).toBe(1);
  });

  it('removes the object when the transaction fails, even if the removal itself fails', async () => {
    const { itemId } = await roundedUnit();
    const failing = jest
      .spyOn(qc.h.dataSource, 'transaction')
      .mockRejectedValueOnce(new Error('connection lost'));
    qc.storage.deleteObject.mockRejectedValueOnce(new Error('storage down'));

    await qc.photo(itemId, PHOTO).expect(500);

    failing.mockRestore();
    const storedKey = qc.storage.upload.mock.calls[0][0];
    expect(qc.storage.deleteObject).toHaveBeenCalledWith(storedKey);
    expect(await qc.photoRows(itemId)).toBe(0);
  });

  it('refuses a role without qc_inspection:create (403) before anything is stored', async () => {
    const { itemId } = await roundedUnit();

    await qc.photo(itemId, PHOTO, 'salesB').expect(403);

    expect(qc.storage.upload).not.toHaveBeenCalled();
    expect(await qc.photoRows(itemId)).toBe(0);
  });

  it('answers 404 for a round item that does not exist and never calls storage', async () => {
    await qc.photo(2_000_000_000, PHOTO).expect(404);

    expect(qc.storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a file that is not an image (400) before looking anything up', async () => {
    const { itemId } = await roundedUnit();

    await qc
      .photo(itemId, { name: 'plan.png', bytes: Buffer.from('%PDF-1.7') })
      .expect(400);

    expect(qc.storage.upload).not.toHaveBeenCalled();
  });

  it('lists the photo metadata on the round item of the cabinet detail', async () => {
    const { unitId, itemId } = await roundedUnit();
    await qc.photo(itemId, PHOTO).expect(201);

    const res = await qc.h.get(`/delivery/qc/units/${unitId}`, 'qcInspector');

    const detail = res.body as {
      rounds: Array<{ items: Array<{ id: number; photos: unknown[] }> }>;
    };
    const item = detail.rounds[0].items.find((it) => it.id === itemId);
    expect(item?.photos).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey|storage_key/);
  });
});
