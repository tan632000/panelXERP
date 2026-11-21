import {
  JPEG,
  PNG,
  pngOfSize,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openQcHarness,
  type QcHarness,
} from '@plugins/delivery/qc-inspection/qc-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

const MB = 1024 * 1024;

/**
 * The QC photo routes over HTTP against the real Postgres of the compose stack: the multer size
 * limit, the headers of the image route and who may read a photo of a cabinet.
 */
describeWithDatabase('QC photo routes (real Postgres)', () => {
  jest.setTimeout(90_000);

  let qc: QcHarness;
  let unitId: number;
  let itemId: number;

  beforeAll(async () => {
    qc = await openQcHarness();
    const ready = await qc.readyUnit();
    await qc.submit(ready.unitId, {}, 'qcInspector', 201);
    unitId = ready.unitId;
    itemId = await qc.roundItemId(unitId);
  });

  afterAll(async () => {
    await qc?.close();
  });

  beforeEach(() => {
    qc.storage.upload.mockClear();
  });

  const content = (photoId: number, as: Parameters<QcHarness['photo']>[2]) =>
    qc.h.get(`/delivery/qc/photos/${photoId}/content`, as);

  const photoOf = async (name = 'a.png', bytes = PNG) => {
    const res = await qc.photo(itemId, { name, bytes }).expect(201);
    return (res.body as { id: number }).id;
  };

  describe('the size limit', () => {
    it('takes exactly 10 MB', async () => {
      await qc
        .photo(itemId, { name: 'big.png', bytes: pngOfSize(10 * MB) })
        .expect(201);
    });

    it('refuses 10 MB plus one byte with 413 and stores nothing', async () => {
      await qc
        .photo(itemId, { name: 'big.png', bytes: pngOfSize(10 * MB + 1) })
        .expect(413);

      expect(qc.storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('the image route', () => {
    it.each([
      ['a.png', PNG, 'image/png'],
      ['a.jpg', JPEG, 'image/jpeg'],
    ])(
      'serves %s inline with the stored content type and nosniff',
      async (name, bytes, contentType) => {
        const photoId = await photoOf(name, bytes);

        const res = await content(photoId, 'qcInspector').expect(200);

        expect(res.headers['content-type']).toContain(contentType);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['content-disposition'] ?? '').not.toMatch(
          /attachment/i,
        );
        expect(res.headers['content-length']).toBe(String(bytes.length));
        expect(Buffer.from(res.body as Buffer).equals(bytes)).toBe(true);
      },
    );

    it('answers 404 when the stored object is gone and for an unknown photo', async () => {
      const photoId = await photoOf();
      qc.storage.objects.clear();

      await content(photoId, 'qcInspector').expect(404);
      await content(2_000_000_000, 'qcInspector').expect(404);
    });
  });

  describe('who reads a photo', () => {
    it('shows it to the sales owner of the order, hides it from another sales user (404) and from a technician (403)', async () => {
      const photoId = await photoOf();

      await content(photoId, 'salesA').expect(200);
      await content(photoId, 'salesB').expect(404);
      await content(photoId, 'techA').expect(403);
    });

    it('carries no storage key in the upload answer or the cabinet detail', async () => {
      const res = await qc.photo(itemId, { name: 'a.png', bytes: PNG });
      const detail = await qc.h.get(
        `/delivery/qc/units/${unitId}`,
        'qcInspector',
      );

      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/storageKey|storage_key/);
      expect(JSON.stringify(detail.body)).not.toMatch(
        /storageKey|storage_key|delivery\/qc-photo/,
      );
    });
  });
});
