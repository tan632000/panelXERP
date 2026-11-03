import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';
import { releasedOrder } from '@plugins/production/progress/progress-db.helper-spec';
import {
  JPEG,
  openPhotoHarness,
  PDF,
  PNG,
  type PhotoHarness,
} from '@plugins/production/progress/unit-photo-db.helper-spec';

import type { Response } from 'supertest';

const HEADER_LOCK = `SELECT id FROM production_orders WHERE id = $1 FOR UPDATE`;
const KEY_PATTERN = (unitId: number) =>
  new RegExp(`^production/${unitId}/[0-9a-f-]{36}\\.(png|jpg)$`);

const statusOf = (result: PromiseSettledResult<Response>) =>
  result.status === 'fulfilled' ? result.value.status : 'rejected';

/**
 * Photo uploads over HTTP against the real Postgres of the compose stack, with object storage
 * faked: what is refused, what is stored under which key, the 30-photo limit under the locks,
 * and the stored object removed again when the row is not written.
 */
describeWithDatabase('Unit photos (real Postgres)', () => {
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

  const cabinet = async (quantity = 1) => {
    const order = await releasedOrder(p.h, quantity);
    return { ...order, unitId: order.units[0].id };
  };

  /** Rows written straight to the table, as many earlier uploads would have. */
  const seedPhotos = async (unitId: number, count: number) => {
    await p.h.dataSource.query(
      `INSERT INTO production_unit_photos
         (unit_id, stage, storage_key, file_name, content_type, size_bytes, uploaded_by)
       SELECT $1, 'material_prep', 'production/seeded/' || n || '.png', 'seed.png',
              'image/png', 4, $2
         FROM generate_series(1, $3) AS n`,
      [unitId, p.h.actors.techA.userId, count],
    );
  };

  describe('what is accepted', () => {
    it.each([
      ['site.png', PNG, 'image/png', 'png'],
      ['site.jpg', JPEG, 'image/jpeg', 'jpg'],
      ['site.JPEG', JPEG, 'image/jpeg', 'jpg'],
    ])(
      'stores %s under a generated key with the stored content type',
      async (name, bytes, contentType, extension) => {
        const { unitId } = await cabinet();

        const res = await p
          .upload(unitId, { name, bytes }, { stage: 'wiring' })
          .expect(201);

        expect(res.body).toMatchObject({
          unitId,
          stage: 'wiring',
          issueId: null,
          fileName: name,
          contentType,
          sizeBytes: bytes.length,
          uploadedBy: p.h.actors.techA.userId,
        });
        const [key, body, type] = p.storage.upload.mock.calls[0];
        expect(key).toMatch(KEY_PATTERN(unitId));
        expect(key.endsWith(`.${extension}`)).toBe(true);
        expect(key).not.toContain(name.split('.')[0]);
        expect(body).toEqual(bytes);
        expect(type).toBe(contentType);
      },
    );

    it('never puts the uploaded file name into the key and sanitises the display name', async () => {
      const { unitId } = await cabinet();

      const res = await p
        .upload(unitId, { name: 'sub/evil<name>.png', bytes: PNG })
        .expect(201);

      const [key] = p.storage.upload.mock.calls[0];
      expect(key).toMatch(KEY_PATTERN(unitId));
      expect(key).not.toContain('evil');
      expect((res.body as { fileName: string }).fileName).toBe(
        'evil_name_.png',
      );
    });

    it('carries no storage key in the upload response or the list', async () => {
      const { unitId } = await cabinet();
      const created = await p
        .upload(unitId, { name: 'a.png', bytes: PNG })
        .expect(201);
      const listed = await p.h
        .get(`/production/units/${unitId}/photos`, 'techA')
        .expect(200);

      for (const body of [created.body, listed.body]) {
        const text = JSON.stringify(body);
        expect(text).not.toMatch(/storageKey|storage_key|"key"/);
        expect(text).not.toContain('production/');
      }
    });
  });

  describe('what is refused', () => {
    it('refuses a PDF renamed .png (400) and stores nothing', async () => {
      const { unitId } = await cabinet();

      await p.upload(unitId, { name: 'plan.png', bytes: PDF }).expect(400);

      expect(p.storage.upload).not.toHaveBeenCalled();
      expect(await p.photoRows(unitId)).toBe(0);
    });

    it('refuses a JPEG renamed .png (400) and a PNG renamed .jpg (400)', async () => {
      const { unitId } = await cabinet();

      await p.upload(unitId, { name: 'a.png', bytes: JPEG }).expect(400);
      await p.upload(unitId, { name: 'a.jpg', bytes: PNG }).expect(400);

      expect(p.storage.upload).not.toHaveBeenCalled();
    });

    it.each(['plan.pdf', 'drawing.dwg', 'noextension'])(
      'refuses the name %s (400)',
      async (name) => {
        const { unitId } = await cabinet();
        await p.upload(unitId, { name, bytes: PNG }).expect(400);
        expect(p.storage.upload).not.toHaveBeenCalled();
      },
    );

    it('refuses an unknown stage and a missing file (400)', async () => {
      const { unitId } = await cabinet();

      await p
        .upload(unitId, { name: 'a.png', bytes: PNG }, { stage: 'painting' })
        .expect(400);
      await p.h
        .post(`/production/units/${unitId}/photos`, { stage: 'wiring' })
        .expect(400);
    });

    it('refuses a technician who is not assigned, and a sales actor, without storing', async () => {
      const { unitId } = await cabinet();

      await p
        .upload(unitId, { name: 'a.png', bytes: PNG }, {}, 'techB')
        .expect(404);
      await p
        .upload(unitId, { name: 'a.png', bytes: PNG }, {}, 'salesA')
        .expect(403);

      expect(p.storage.upload).not.toHaveBeenCalled();
    });

    it('lets a production manager upload to any cabinet', async () => {
      const { unitId } = await cabinet();
      await p
        .upload(unitId, { name: 'a.png', bytes: PNG }, {}, 'manager')
        .expect(201);
    });

    it('refuses a photo for an order that is no longer released (409) and removes the object', async () => {
      const { unitId, id } = await cabinet();
      await p.h
        .post(`/production/orders/${id}/cancel`, { reason: 'Customer left' })
        .expect(200);

      await p.upload(unitId, { name: 'a.png', bytes: PNG }).expect(409);

      expect(p.storage.deleteObject).toHaveBeenCalledTimes(1);
      expect(await p.photoRows(unitId)).toBe(0);
    });
  });

  describe('the limit of 30', () => {
    it('refuses the 31st photo (400) and removes its object', async () => {
      const { unitId } = await cabinet();
      await seedPhotos(unitId, 30);

      await p.upload(unitId, { name: 'a.png', bytes: PNG }).expect(400);

      expect(await p.photoRows(unitId)).toBe(30);
      const [stored] = p.storage.upload.mock.calls[0];
      expect(p.storage.deleteObject).toHaveBeenCalledWith(stored);
    });

    it('takes the 30th photo', async () => {
      const { unitId } = await cabinet();
      await seedPhotos(unitId, 29);

      await p.upload(unitId, { name: 'a.png', bytes: PNG }).expect(201);

      expect(await p.photoRows(unitId)).toBe(30);
    });

    it('lets one of two uploads at 29 photos in, the second queued behind the first', async () => {
      const { unitId, id } = await cabinet();
      await seedPhotos(unitId, 29);

      const results = await queuedBehind<Response>(
        p.h.dataSource,
        HEADER_LOCK,
        [id],
        [
          () => p.upload(unitId, { name: 'one.png', bytes: PNG }),
          () => p.upload(unitId, { name: 'two.png', bytes: PNG }),
        ],
      );

      expect(results.map(statusOf).sort()).toEqual([201, 400]);
      expect(await p.photoRows(unitId)).toBe(30);
      // The loser's object is removed again; the winner's stays.
      expect(p.storage.deleteObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('an issue on a photo', () => {
    const openIssue = async (unitId: number) => {
      const res = await p.h
        .post(
          `/production/units/${unitId}/issues`,
          { stage: 'wiring', description: 'Loose lug', severity: 'low' },
          'techA',
        )
        .expect(201);
      return (res.body as { id: number }).id;
    };

    it('attaches a photo to an issue of the same cabinet', async () => {
      const { unitId } = await cabinet();
      const issueId = await openIssue(unitId);

      const res = await p
        .upload(unitId, { name: 'a.png', bytes: PNG }, { issueId })
        .expect(201);

      expect((res.body as { issueId: number }).issueId).toBe(issueId);
    });

    it('refuses the issue of another cabinet (400): the object is removed and no row remains', async () => {
      const order = await cabinet(2);
      const [first, second] = order.units;
      const foreign = await openIssue(first.id);

      await p
        .upload(second.id, { name: 'a.png', bytes: PNG }, { issueId: foreign })
        .expect(400);

      const [stored] = p.storage.upload.mock.calls[0];
      expect(p.storage.deleteObject).toHaveBeenCalledWith(stored);
      expect(await p.photoRows(second.id)).toBe(0);
    });

    it('refuses an issue that does not exist (400)', async () => {
      const { unitId } = await cabinet();
      await p
        .upload(unitId, { name: 'a.png', bytes: PNG }, { issueId: 2000000000 })
        .expect(400);
    });
  });
});
