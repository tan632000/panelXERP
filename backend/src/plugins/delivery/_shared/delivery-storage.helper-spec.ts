import { randomBytes } from 'crypto';
import { Readable } from 'stream';

/** Smallest byte strings that pass each format's content check. */
export const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest'),
]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
export const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n', 'latin1');

/** A valid-looking PNG of a given size. */
export const pngOfSize = (bytes: number): Buffer =>
  Buffer.concat([PNG, randomBytes(Math.max(0, bytes - PNG.length))]);

/**
 * Object storage in memory: what was stored, and what was asked to be deleted. Named
 * `*.helper-spec.ts` so the production build leaves it out and jest does not run it as a test.
 */
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
