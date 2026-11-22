import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import {
  JPEG,
  PDF,
  PNG,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openInstallationHarness,
  type InstallationHarness,
} from '@plugins/delivery/installation/installation-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

interface PhotoBody {
  id: number;
  fileName: string;
  contentType: string;
}

/**
 * The photos of an installation against the real Postgres of the compose stack: what is accepted
 * and stored under which key, the limit of 30 even when uploads race for the last places, what
 * happens to the object when the row is not written, and that nothing is stored for an
 * installation the actor cannot see.
 */
describeWithDatabase('InstallationPhotoService (real Postgres)', () => {
  jest.setTimeout(180_000);

  let d: InstallationHarness;

  beforeAll(async () => {
    d = await openInstallationHarness();
  });

  afterAll(async () => {
    await d?.close();
  });

  beforeEach(() => {
    d.storage.objects.clear();
    d.storage.upload.mockClear();
    d.storage.deleteObject.mockClear();
  });

  it('stores PNG and JPEG under random keys with the type found in the content, and lists them without a key', async () => {
    const { id } = await d.planned();

    const png = await d
      .upload(id, { name: 'Ảnh tủ.PNG', bytes: PNG })
      .expect(201);
    const jpeg = await d
      .upload(id, { name: 'site.jpeg', bytes: JPEG })
      .expect(201);

    expect((png.body as PhotoBody).contentType).toBe('image/png');
    expect((jpeg.body as PhotoBody).contentType).toBe('image/jpeg');
    const keys = [...d.storage.objects.keys()];
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).toMatch(
        new RegExp(
          `^delivery/installation-photo/${id}/[0-9a-f-]{36}\\.(png|jpg)$`,
        ),
      );
    }
    const detail = await d.get(`/delivery/installations/${id}`).expect(200);
    expect((detail.body as { photos: unknown[] }).photos).toHaveLength(2);
    expect(JSON.stringify([png.body, jpeg.body, detail.body])).not.toMatch(
      /storage|delivery\/installation-photo/i,
    );
  });

  it('refuses a PDF, a PNG renamed to .jpg and a missing file, storing nothing', async () => {
    const { id } = await d.planned();

    await d.upload(id, { name: 'minutes.pdf', bytes: PDF }).expect(400);
    await d.upload(id, { name: 'fake.jpg', bytes: PNG }).expect(400);
    await d
      .upload(id, { name: 'fake.png', bytes: Buffer.from('not an image') })
      .expect(400);
    await d.h
      .post(`/delivery/installations/${id}/photos`, {}, 'storekeeper')
      .expect(400);

    expect(d.storage.upload).not.toHaveBeenCalled();
    expect(await d.photoRows(id)).toBe(0);
  });

  it('accepts the 30th photo and refuses the 31st with 400, deleting the object it had stored', async () => {
    const { id } = await d.planned();
    await d.addPhotoRows(id, 29);

    await d.upload(id).expect(201);
    expect(d.storage.objects.size).toBe(1);
    await d.upload(id).expect(400);

    expect(await d.photoRows(id)).toBe(30);
    expect(d.storage.objects.size).toBe(1);
    expect(d.storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('lets one of two uploads racing for the last place win, the other answering 400', async () => {
    const { id, orderId } = await d.planned();
    await d.addPhotoRows(id, 29);
    const upload = async () => (await d.upload(id)).status;

    const outcomes = await queuedBehind(
      d.h.dataSource,
      `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE`,
      [orderId],
      [upload, upload],
    );

    expect(
      outcomes.map((outcome) =>
        outcome.status === 'fulfilled' ? outcome.value : -1,
      ),
    ).toEqual([201, 400]);
    expect(await d.photoRows(id)).toBe(30);
    // The loser stored its object before it met the lock; it must not be left behind.
    expect(d.storage.objects.size).toBe(1);
    expect(d.storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('deletes the object and writes no row when the storage fails', async () => {
    const { id } = await d.planned();
    d.storage.upload.mockImplementationOnce(() =>
      Promise.reject(new Error('Storage down')),
    );

    await d.upload(id).expect(500);

    expect(d.storage.objects.size).toBe(0);
    expect(d.storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(await d.photoRows(id)).toBe(0);
  });

  it('answers 404 for an installation that does not exist and never calls the storage', async () => {
    await d.upload(2147483000).expect(404);

    expect(d.storage.upload).not.toHaveBeenCalled();
  });

  it('answers 404 to another sales rep, even with the manage permission, and stores nothing', async () => {
    const { id } = await d.planned();

    await d.withGrant('salesB', 'installation:manage', () =>
      d.upload(id, {}, 'salesB').expect(404),
    );

    expect(d.storage.upload).not.toHaveBeenCalled();
    expect(await d.photoRows(id)).toBe(0);
  });

  it('refuses the order owner and a technician with 403 and stores nothing', async () => {
    const { id } = await d.planned();

    await d.upload(id, {}, 'salesA').expect(403);
    await d.upload(id, {}, 'techA').expect(403);

    expect(d.storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a photo for an installation whose order was cancelled, leaving no object', async () => {
    const { id, orderId } = await d.planned();
    await d.setOrderStatus(orderId, 'cancelled');

    await d.upload(id).expect(409);

    expect(d.storage.objects.size).toBe(0);
    expect(await d.photoRows(id)).toBe(0);
  });

  it('takes photos on a done installation of a delivered order', async () => {
    const { id, orderId } = await d.planned();
    await d.setOrderStatus(orderId, 'delivered');
    await d.start(id).expect(200);
    await d.finish(id).expect(200);

    await d.upload(id).expect(201);
  });
});
