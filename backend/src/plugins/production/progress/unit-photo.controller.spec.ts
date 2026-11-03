import request from 'supertest';

import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';
import { releasedOrder } from '@plugins/production/progress/progress-db.helper-spec';
import {
  JPEG,
  openPhotoHarness,
  pngOfSize,
  PNG,
  type PhotoHarness,
} from '@plugins/production/progress/unit-photo-db.helper-spec';

const MB = 1024 * 1024;

/**
 * The photo routes over HTTP against the real Postgres of the compose stack: the multer size
 * limit, the headers of the image route and who may read a photo of a cabinet.
 */
describeWithDatabase('Unit photo routes (real Postgres)', () => {
  jest.setTimeout(90_000);

  let p: PhotoHarness;

  beforeAll(async () => {
    p = await openPhotoHarness();
  });

  afterAll(async () => {
    await p?.h.close();
  });

  beforeEach(() => {
    p.storage.upload.mockClear();
    p.storage.deleteObject.mockClear();
  });

  const photoOf = async (name = 'a.png', bytes = PNG) => {
    const order = await releasedOrder(p.h);
    const unitId = order.units[0].id;
    const res = await p.upload(unitId, { name, bytes }).expect(201);
    return { ...order, unitId, photoId: (res.body as { id: number }).id };
  };

  const content = (
    photoId: number,
    as: Parameters<PhotoHarness['h']['get']>[1],
  ) => p.h.get(`/production/photos/${photoId}/content`, as);

  describe('the size limit', () => {
    it('refuses 10 MB plus one byte with 413 and stores nothing', async () => {
      const order = await releasedOrder(p.h);
      const unitId = order.units[0].id;

      await p
        .upload(unitId, { name: 'big.png', bytes: pngOfSize(10 * MB + 1) })
        .expect(413);

      expect(p.storage.upload).not.toHaveBeenCalled();
      expect(await p.photoRows(unitId)).toBe(0);
    });

    it('takes exactly 10 MB', async () => {
      const order = await releasedOrder(p.h);
      const unitId = order.units[0].id;

      await p
        .upload(unitId, { name: 'big.png', bytes: pngOfSize(10 * MB) })
        .expect(201);
    });
  });

  describe('the image route', () => {
    it.each([
      ['a.png', PNG, 'image/png'],
      ['a.jpg', JPEG, 'image/jpeg'],
    ])(
      'serves %s with the stored content type and nosniff',
      async (name, bytes, contentType) => {
        const { photoId } = await photoOf(name, bytes);

        const res = await content(photoId, 'techA').expect(200);

        expect(res.headers['content-type']).toContain(contentType);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['content-length']).toBe(String(bytes.length));
        expect(Buffer.from(res.body as Buffer).equals(bytes)).toBe(true);
      },
    );

    it('serves the type found in the bytes, never the one the client declared', async () => {
      const order = await releasedOrder(p.h);
      const unitId = order.units[0].id;
      const created = await request(p.h.app.getHttpServer())
        .post(`/production/units/${unitId}/photos`)
        .set('x-test-actor', p.h.token('techA'))
        .field('stage', 'wiring')
        .attach('file', PNG, { filename: 'a.png', contentType: 'text/html' })
        .expect(201);
      const { id, contentType } = created.body as {
        id: number;
        contentType: string;
      };

      const res = await content(id, 'techA').expect(200);

      expect(contentType).toBe('image/png');
      expect(res.headers['content-type']).toContain('image/png');
      expect(p.storage.upload.mock.calls[0][2]).toBe('image/png');
    });

    it('answers 404 when the stored object is gone and for an unknown photo', async () => {
      const { photoId } = await photoOf();
      p.storage.objects.clear();

      await content(photoId, 'techA').expect(404);
      await content(2000000000, 'techA').expect(404);
    });
  });

  describe('who reads a photo', () => {
    it('hides the photo and the list of a cabinet from another technician (404)', async () => {
      const { photoId, unitId } = await photoOf();

      await content(photoId, 'techB').expect(404);
      await p.h.get(`/production/units/${unitId}/photos`, 'techB').expect(404);
    });

    it('shows them to the assignee, a manager, a director and the sales owner of the order', async () => {
      const { photoId, unitId } = await photoOf();

      for (const actor of ['techA', 'manager', 'director', 'salesA'] as const) {
        await content(photoId, actor).expect(200);
        const list = await p.h
          .get(`/production/units/${unitId}/photos`, actor)
          .expect(200);
        expect(list.body as unknown[]).toHaveLength(1);
      }
    });

    it('hides them from the sales owner of another order (404) and a role without progress read (403)', async () => {
      const { photoId, unitId } = await photoOf();

      await content(photoId, 'salesB').expect(404);
      await p.h.get(`/production/units/${unitId}/photos`, 'salesB').expect(404);
      await content(photoId, 'storekeeper').expect(403);
    });

    it('lists the photos of every stage, oldest first, without a storage key', async () => {
      const order = await releasedOrder(p.h);
      const unitId = order.units[0].id;
      await p.upload(
        unitId,
        { name: 'a.png', bytes: PNG },
        { stage: 'wiring' },
      );
      await p.upload(
        unitId,
        { name: 'b.jpg', bytes: JPEG },
        { stage: 'enclosure' },
      );

      const res = await p.h
        .get(`/production/units/${unitId}/photos`, 'manager')
        .expect(200);

      const photos = res.body as Array<{ id: number; stage: string }>;
      expect(photos.map((photo) => photo.stage)).toEqual([
        'wiring',
        'enclosure',
      ]);
      expect(JSON.stringify(photos)).not.toMatch(/storageKey|storage_key/);
    });
  });
});
