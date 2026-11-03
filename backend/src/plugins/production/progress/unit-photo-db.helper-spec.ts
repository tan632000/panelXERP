import { randomBytes } from 'crypto';
import { Readable } from 'stream';

import request from 'supertest';

import { S3StorageService } from '@shared/services/s3-storage.service';

import { ProductionIssue } from '@plugins/production/production-issue/entities/production-issue.entity';
import { ProductionIssueController } from '@plugins/production/production-issue/production-issue.controller';
import { ProductionIssueService } from '@plugins/production/production-issue/services/production-issue.service';
import {
  openProductionHarness,
  type ActorName,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import { UnitPhoto } from '@plugins/production/progress/entities/unit-photo.entity';
import { ProgressController } from '@plugins/production/progress/progress.controller';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import { ProgressService } from '@plugins/production/progress/services/progress.service';
import { UnitPhotoService } from '@plugins/production/progress/services/unit-photo.service';
import { UnitPhotoController } from '@plugins/production/progress/unit-photo.controller';

/** Smallest byte strings that pass each format's content check. */
export const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest'),
]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
export const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n', 'latin1');

/** Object storage in memory: what was stored, and what was asked to be deleted. */
export function storageFake() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    objects,
    upload: jest.fn((key: string, body: Buffer, contentType: string) => {
      objects.set(key, { body, contentType });
      return Promise.resolve();
    }),
    getObjectStream: jest.fn((key: string) => {
      const found = objects.get(key);
      return found
        ? Promise.resolve(Readable.from(found.body))
        : Promise.reject(
            Object.assign(new Error('missing'), { name: 'NoSuchKey' }),
          );
    }),
    deleteObject: jest.fn((key: string) => {
      objects.delete(key);
      return Promise.resolve();
    }),
  };
}

export type StorageFake = ReturnType<typeof storageFake>;

export interface PhotoHarness {
  h: ProductionHarness;
  storage: StorageFake;
  /** Multipart upload of one file, with the given text fields. */
  upload(
    unitId: number,
    file: { name: string; bytes: Buffer },
    fields?: { stage?: string; issueId?: number },
    as?: ActorName,
  ): request.Test;
  photoRows(unitId: number): Promise<number>;
}

/** The production harness with progress, photos and issues mounted over a storage fake. */
export async function openPhotoHarness(): Promise<PhotoHarness> {
  const storage = storageFake();
  const h = await openProductionHarness([UnitPhoto, ProductionIssue], {
    controllers: [
      ProgressController,
      UnitPhotoController,
      ProductionIssueController,
    ],
    providers: [
      ProgressService,
      ProgressQueryService,
      UnitPhotoService,
      ProductionIssueService,
      { provide: S3StorageService, useValue: storage },
    ],
  });
  return {
    h,
    storage,
    upload(unitId, file, fields = {}, as = 'techA') {
      const test = request(h.app.getHttpServer())
        .post(`/production/units/${unitId}/photos`)
        .set('x-test-actor', h.token(as))
        .field('stage', fields.stage ?? 'material_prep');
      if (fields.issueId !== undefined) {
        test.field('issueId', String(fields.issueId));
      }
      return test.attach('file', file.bytes, file.name);
    },
    async photoRows(unitId) {
      const [row]: Array<{ n: string }> = await h.dataSource.query(
        `SELECT COUNT(*) AS n FROM production_unit_photos WHERE unit_id = $1`,
        [unitId],
      );
      return Number(row.n);
    },
  };
}

/** A valid-looking PNG of a given size. */
export const pngOfSize = (bytes: number): Buffer =>
  Buffer.concat([PNG, randomBytes(Math.max(0, bytes - PNG.length))]);
