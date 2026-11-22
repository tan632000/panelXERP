import {
  JPEG,
  PDF,
  PNG,
  pngOfSize,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openAcceptanceHarness,
  type AcceptanceHarness,
} from '@plugins/delivery/acceptance/acceptance-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

import type { ProductionTestActor } from '@plugins/production/_shared/finished-unit-kit.helper-spec';

const MB = 1024 * 1024;

/**
 * The acceptance routes over HTTP against the real Postgres of the compose stack: the limits of
 * the multipart parser, the headers of the content route, who may read a file and what a
 * response and an object key show.
 */
describeWithDatabase('Acceptance routes (real Postgres)', () => {
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

  const content = (fileId: number, as?: ProductionTestActor) =>
    d.get(`/delivery/acceptance-files/${fileId}/content`, as);

  describe('the upload limits', () => {
    it('refuses a renamed file with 400', async () => {
      const orderId = await d.deliveredOrder();

      await d
        .accept(orderId, { files: [{ name: 'minutes.pdf', bytes: PNG }] })
        .expect(400);
      await d
        .accept(orderId, { files: [{ name: 'minutes.jpg', bytes: PDF }] })
        .expect(400);

      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.h.statusOfOrder(orderId)).toBe('delivered');
    });

    it('refuses 20 MB plus one byte with 413 and stores nothing', async () => {
      const orderId = await d.deliveredOrder();

      await d
        .accept(orderId, {
          files: [{ name: 'big.png', bytes: pngOfSize(20 * MB + 1) }],
        })
        .expect(413);

      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.acceptanceRows(orderId)).toBe(0);
    });

    it('accepts exactly 20 MB', async () => {
      const orderId = await d.deliveredOrder();

      await d
        .accept(orderId, {
          files: [{ name: 'big.png', bytes: pngOfSize(20 * MB) }],
        })
        .expect(201);
    });

    it('accepts ten files and refuses eleven with 400', async () => {
      const files = (count: number) =>
        Array.from({ length: count }, (_, index) => ({
          name: `page-${index}.png`,
          bytes: PNG,
        }));
      const ten = await d.deliveredOrder();
      const eleven = await d.deliveredOrder();

      await d.accept(eleven, { files: files(11) }).expect(400);
      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.acceptanceRows(eleven)).toBe(0);
      await d.accept(ten, { files: files(10) }).expect(201);

      expect(d.storage.objects.size).toBe(10);
    });
  });

  describe('the content route', () => {
    it('serves the stored type as an attachment, and the browser may not sniff it', async () => {
      const { fileId } = await d.accepted();

      const res = await content(fileId).expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toMatch(/^attachment/);
    });

    it('serves an image as an attachment too', async () => {
      const orderId = await d.deliveredOrder();
      const res = await d
        .accept(orderId, { files: [{ name: 'scan.jpg', bytes: JPEG }] })
        .expect(201);
      const fileId = (res.body as { files: Array<{ id: number }> }).files[0].id;

      const served = await content(fileId, 'storekeeper').expect(200);

      expect(served.headers['content-type']).toContain('image/jpeg');
      expect(served.headers['content-disposition']).toMatch(/^attachment/);
    });

    it('lets the order owner and the storekeeper read it and hides it from another sales rep', async () => {
      const { fileId } = await d.accepted();

      await content(fileId, 'salesA').expect(200);
      await content(fileId, 'storekeeper').expect(200);
      await content(fileId, 'salesB').expect(404);
    });

    it('refuses a technician and a QC inspector with 403', async () => {
      const { fileId } = await d.accepted();

      await content(fileId, 'techA').expect(403);
      await content(fileId, 'qcInspector').expect(403);
    });

    it('answers 404 for a missing file and when the object is gone from storage', async () => {
      const { fileId } = await d.accepted();

      await content(2147483000).expect(404);
      d.storage.objects.clear();
      await content(fileId).expect(404);
    });
  });

  it('keeps every object under a random key of the order and shows no key in a response', async () => {
    const orderId = await d.deliveredOrder();
    const created = await d.accept(orderId).expect(201);
    const read = await d
      .get(`/delivery/orders/${orderId}/acceptance`)
      .expect(200);

    const keys = [...d.storage.objects.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(
      new RegExp(
        `^delivery/acceptance/${orderId}/[0-9a-f-]{36}\\.(pdf|png|jpg)$`,
      ),
    );
    expect(JSON.stringify([created.body, read.body])).not.toMatch(
      /storage|delivery\/acceptance\//i,
    );
  });
});
