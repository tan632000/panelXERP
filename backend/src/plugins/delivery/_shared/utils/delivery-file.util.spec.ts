import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

import {
  checkDocument,
  checkPhoto,
  MAX_DOCUMENT_BYTES,
  MAX_PHOTO_BYTES,
  objectKey,
} from '@plugins/delivery/_shared/utils/delivery-file.util';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest'),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n', 'latin1');
const DWG = Buffer.from('AC1032 drawing');

const file = (originalname: string, buffer: Buffer) => ({
  originalname,
  buffer,
});

describe('checkPhoto', () => {
  it('takes a PNG and a JPEG whose bytes match their name, whatever the case or spelling', () => {
    expect(checkPhoto(file('a.PNG', PNG))).toMatchObject({
      extension: 'png',
      contentType: 'image/png',
    });
    expect(checkPhoto(file('b.jpeg', JPEG))).toMatchObject({
      extension: 'jpg',
      contentType: 'image/jpeg',
    });
  });

  it('refuses a PDF renamed .png: the extension alone does not decide', () => {
    expect(() => checkPhoto(file('plan.png', PDF))).toThrow(
      BadRequestException,
    );
  });

  it('refuses a name that is not a photo type, a missing file and an oversized one', () => {
    expect(() => checkPhoto(file('plan.pdf', PDF))).toThrow(
      BadRequestException,
    );
    expect(() => checkPhoto(undefined)).toThrow(BadRequestException);
    expect(() =>
      checkPhoto(file('big.png', Buffer.alloc(MAX_PHOTO_BYTES + 1))),
    ).toThrow(PayloadTooLargeException);
  });

  it('takes exactly the size limit', () => {
    const exact = Buffer.concat([
      PNG,
      Buffer.alloc(MAX_PHOTO_BYTES - PNG.length),
    ]);
    expect(checkPhoto(file('big.png', exact)).buffer.length).toBe(
      MAX_PHOTO_BYTES,
    );
  });
});

describe('checkDocument', () => {
  it.each([
    ['a.pdf', PDF, 'pdf', 'application/pdf'],
    ['a.png', PNG, 'png', 'image/png'],
    ['a.jpeg', JPEG, 'jpg', 'image/jpeg'],
  ])('takes %s', async (name, bytes, extension, contentType) => {
    await expect(checkDocument(file(name, bytes))).resolves.toMatchObject({
      extension,
      contentType,
    });
  });

  it('refuses a PNG renamed .pdf', async () => {
    await expect(checkDocument(file('a.pdf', PNG))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a drawing, even a real one: .dwg is not a document type here', async () => {
    await expect(checkDocument(file('a.dwg', DWG))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a document over 20 MB and a missing file', async () => {
    await expect(
      checkDocument(file('a.pdf', Buffer.alloc(MAX_DOCUMENT_BYTES + 1))),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(checkDocument(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('objectKey', () => {
  it('is delivery/<kind>/<ownerId>/<uuid>.<ext>, random and never the uploaded name', () => {
    const uploaded = '../../etc/passwd.png';
    const key = objectKey('qc-photo', 12, 'png');

    expect(key).toMatch(
      /^delivery\/qc-photo\/12\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
    expect(key).not.toContain('passwd');
    expect(key).not.toContain(uploaded);
    expect(objectKey('qc-photo', 12, 'png')).not.toBe(key);
  });
});
