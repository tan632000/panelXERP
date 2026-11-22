import { pngOfSize } from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openInstallationHarness,
  type InstallationHarness,
} from '@plugins/delivery/installation/installation-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

import type { ProductionTestActor } from '@plugins/production/_shared/finished-unit-kit.helper-spec';

const MB = 1024 * 1024;

/**
 * The installation routes over HTTP against the real Postgres of the compose stack: the size
 * limit of the multipart parser, the headers of the content route and who may read a photo.
 */
describeWithDatabase('Installation routes (real Postgres)', () => {
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

  const withPhoto = async () => {
    const installation = await d.planned();
    const res = await d.upload(installation.id).expect(201);
    return { ...installation, photoId: (res.body as { id: number }).id };
  };
  const content = (photoId: number, as?: ProductionTestActor) =>
    d.get(`/delivery/installation-photos/${photoId}/content`, as);

  describe('the size limit', () => {
    it('refuses 10 MB plus one byte with 413 and stores nothing', async () => {
      const { id } = await d.planned();

      await d
        .upload(id, { name: 'big.png', bytes: pngOfSize(10 * MB + 1) })
        .expect(413);

      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.photoRows(id)).toBe(0);
    });

    it('accepts exactly 10 MB', async () => {
      const { id } = await d.planned();

      await d
        .upload(id, { name: 'big.png', bytes: pngOfSize(10 * MB) })
        .expect(201);
    });
  });

  describe('the content route', () => {
    it('serves the stored type inline, and the browser may not sniff it', async () => {
      const r = await withPhoto();

      const res = await content(r.photoId).expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition'] ?? '').not.toMatch(
        /attachment/,
      );
    });

    it('lets the order owner read it and hides it from another sales rep', async () => {
      const r = await withPhoto();

      await content(r.photoId, 'salesA').expect(200);
      await content(r.photoId, 'salesB').expect(404);
    });

    it('answers 404 for a missing photo and when the object is gone from storage', async () => {
      const r = await withPhoto();

      await content(2147483000).expect(404);
      d.storage.objects.clear();
      await content(r.photoId).expect(404);
    });

    it('refuses a technician and a caller without installation:read', async () => {
      const r = await withPhoto();

      await content(r.photoId, 'techA').expect(403);
      await content(r.photoId, 'qcInspector').expect(403);
    });
  });

  it('shows no storage key in any response', async () => {
    const r = await withPhoto();

    const detail = await d.get(`/delivery/installations/${r.id}`).expect(200);
    const list = await d
      .get(`/delivery/installations?orderId=${r.orderId}`)
      .expect(200);

    expect(JSON.stringify([detail.body, list.body])).not.toMatch(
      /storage|delivery\/installation-photo/i,
    );
  });
});
