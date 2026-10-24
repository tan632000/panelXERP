import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import JSZip from 'jszip';

import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import {
  buildRequestFixture,
  createDraft,
  ENGINEER_A,
  ENGINEER_B,
  MANAGER,
  SALES_A,
  SALES_B,
  seedRequest,
  type RequestFixture,
} from '@plugins/sales/request/request-fixture.helper-spec';
import { sanitizeAttachmentName } from '@plugins/sales/request/utils/attachment-filename.util';

/** Smallest byte strings that pass each format's content check. */
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n', 'latin1');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest'),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A zip holding exactly the named parts, as an `.xlsx`, a renamed archive or a macro workbook is. */
async function zipOf(parts: string[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const part of parts) zip.file(part, '<x/>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

const DWG = Buffer.from('AC1032\0\0\0\0\0', 'latin1');
const DXF = Buffer.from('  0\r\nSECTION\r\n  2\r\nHEADER\r\n', 'latin1');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

const file = (originalname: string, buffer: Buffer) => ({
  originalname,
  buffer,
  size: buffer.length,
});

async function draftWith(fixture: RequestFixture) {
  return createDraft(fixture, SALES_A);
}

describe('RequestAttachmentService', () => {
  describe('upload: what is accepted', () => {
    it.each([
      ['plan.pdf', PDF, 'application/pdf'],
      ['site.PNG', PNG, 'image/png'],
      ['site.jpg', JPEG, 'image/jpeg'],
      ['site.jpeg', JPEG, 'image/jpeg'],
      ['layout.dwg', DWG, 'application/acad'],
      ['layout.dxf', DXF, 'application/dxf'],
    ])(
      'stores %s with the content type of its format',
      async (name, bytes, type) => {
        const fixture = buildRequestFixture();
        const request = await draftWith(fixture);

        const saved = await fixture.attachmentService.upload(
          request.id,
          file(name, bytes),
          SALES_A,
        );

        expect(saved).toMatchObject({
          requestId: request.id,
          fileName: name,
          contentType: type,
          sizeBytes: bytes.length,
          uploadedBy: SALES_A.userId,
        });
        expect(fixture.storage.upload).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`^sales-requests/${request.id}/[0-9a-f-]{36}\\.`),
          ),
          bytes,
          type,
        );
      },
    );

    it('rejects an .html upload (400) and stores nothing', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('evil.html', HTML),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.storage.upload).not.toHaveBeenCalled();
      expect(fixture.attachments.rows).toHaveLength(0);
    });

    it.each([
      ['.pdf name with HTML bytes', 'fake.pdf', HTML],
      ['.png name with PDF bytes', 'fake.png', PDF],
      ['.jpg name with PNG bytes', 'fake.jpg', PNG],
      [
        '.xlsx name with a bare zip',
        'fake.xlsx',
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
      ],
      ['.dwg name with PDF bytes', 'fake.dwg', PDF],
      ['.dxf name with HTML bytes', 'fake.dxf', HTML],
      [
        '.dxf name with binary DXF content',
        'binary.dxf',
        Buffer.concat([
          Buffer.from('AutoCAD Binary DXF\r\n\x1a\0', 'latin1'),
          Buffer.alloc(32),
        ]),
      ],
      [
        '.dxf name with SECTION not first',
        'fake.dxf',
        Buffer.from('0\nENDSEC\n0\nSECTION\n'),
      ],
      ['empty .pdf', 'empty.pdf', Buffer.alloc(0)],
    ])(
      'rejects %s (400): the bytes decide, not the name',
      async (_label, name, bytes) => {
        const fixture = buildRequestFixture();
        const request = await draftWith(fixture);

        await expect(
          fixture.attachmentService.upload(
            request.id,
            file(name, bytes),
            SALES_A,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(fixture.storage.upload).not.toHaveBeenCalled();
        expect(fixture.attachments.rows).toHaveLength(0);
      },
    );

    it.each([
      'noextension',
      'archive.zip',
      'run.exe',
      'a.pdf.html',
      'x.svg',
      '.pdf',
    ])('rejects the name %s (400)', async (name) => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);

      await expect(
        fixture.attachmentService.upload(request.id, file(name, PDF), SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an extension that is an Object.prototype property, not an allowed type', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('a.constructor', PDF),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a request without a file', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);

      await expect(
        fixture.attachmentService.upload(request.id, undefined, SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a file over 20 MB (413)', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      const big = Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)]);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('big.pdf', big),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(fixture.storage.upload).not.toHaveBeenCalled();
    });

    it('accepts a file of exactly 20 MB', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      const exact = Buffer.concat([
        PDF,
        Buffer.alloc(20 * 1024 * 1024 - PDF.length),
      ]);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('max.pdf', exact),
          SALES_A,
        ),
      ).resolves.toMatchObject({ sizeBytes: 20 * 1024 * 1024 });
    });

    it('holds at most 20 files per request', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      for (let i = 0; i < 20; i++) {
        await fixture.attachmentService.upload(
          request.id,
          file(`p${i}.pdf`, PDF),
          SALES_A,
        );
      }

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('p20.pdf', PDF),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.attachments.rows).toHaveLength(20);
      // The object stored before the refused row is taken back.
      expect(fixture.stored.size).toBe(20);
    });
  });

  describe('upload: xlsx', () => {
    it('accepts a workbook, i.e. a zip holding xl/workbook.xml', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      const workbook = await zipOf([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('boq.xlsx', workbook),
          SALES_A,
        ),
      ).resolves.toMatchObject({ contentType: XLSX_TYPE });
    });

    it('rejects a plain zip renamed to .xlsx (400)', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      const archive = await zipOf(['notes.txt', 'report.docx']);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('boq.xlsx', archive),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.storage.upload).not.toHaveBeenCalled();
    });

    it('rejects a macro workbook renamed to .xlsx (400)', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      const macro = await zipOf([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/vbaProject.bin',
      ]);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('boq.xlsx', macro),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('upload: refused before anything is stored', () => {
    it('does not touch storage for a request that no longer takes files (409)', async () => {
      const fixture = buildRequestFixture();
      const request = seedRequest(fixture, RequestStatus.QUOTED);

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('a.pdf', PDF),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.storage.upload).not.toHaveBeenCalled();
    });

    it('does not touch storage for the 21st file (400)', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      for (let i = 0; i < 20; i++) {
        await fixture.attachmentService.upload(
          request.id,
          file(`p${i}.pdf`, PDF),
          SALES_A,
        );
      }
      fixture.storage.upload.mockClear();
      fixture.storage.deleteObject.mockClear();

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('p20.pdf', PDF),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.storage.upload).not.toHaveBeenCalled();
      expect(fixture.storage.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('upload: what is stored', () => {
    it('never trusts the client for the content type, and sanitises the display name', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);

      const saved = await fixture.attachmentService.upload(
        request.id,
        file('..\\..\\etc/pass<wd>"\r\n; plan.pdf', PDF),
        SALES_A,
      );

      expect(saved.fileName).toBe('pass_wd___ plan.pdf');
      expect(saved.contentType).toBe('application/pdf');
      const [key] = fixture.storage.upload.mock.calls[0];
      expect(key).not.toContain('etc');
      expect(key).not.toContain('..');
    });

    it('keeps accented letters of a UTF-8 name that arrived as latin1', () => {
      const asReceived = Buffer.from('bản vẽ.pdf', 'utf8').toString('latin1');

      expect(sanitizeAttachmentName(asReceived)).toBe('bản vẽ.pdf');
      expect(sanitizeAttachmentName('bản vẽ.pdf')).toBe('bản vẽ.pdf');
    });

    it('caps a long name while keeping its extension', () => {
      const name = sanitizeAttachmentName(`${'a'.repeat(400)}.pdf`);

      expect(name).toHaveLength(150);
      expect(name.endsWith('.pdf')).toBe(true);
    });

    it('takes the stored object back when the row cannot be written', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      fixture.attachments.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('a.pdf', PDF),
          SALES_A,
        ),
      ).rejects.toThrow('db down');

      expect(fixture.attachments.rows).toHaveLength(0);
      expect(fixture.stored.size).toBe(0);
    });

    it('records the upload on the timeline', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);

      await fixture.attachmentService.upload(
        request.id,
        file('a.pdf', PDF),
        SALES_A,
      );

      expect(fixture.activities.rows.at(-1)).toMatchObject({
        action: 'attachment_added',
        note: 'a.pdf',
      });
    });
  });

  describe('data scope', () => {
    async function withFile() {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      const attachment = await fixture.attachmentService.upload(
        request.id,
        file('a.pdf', PDF),
        SALES_A,
      );
      return { fixture, request, attachment };
    }

    it('answers 404 to Sales B for the list, the download, the upload and the removal of Sales A’s file', async () => {
      const { fixture, request, attachment } = await withFile();

      await expect(
        fixture.attachmentService.list(request.id, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.attachmentService.download(request.id, attachment.id, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.attachmentService.upload(
          request.id,
          file('b.pdf', PDF),
          SALES_B,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.attachmentService.remove(request.id, attachment.id, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.storage.getObjectStream).not.toHaveBeenCalled();
      expect(fixture.attachments.rows).toHaveLength(1);
    });

    it('lets the owner, a manager and the assigned engineer download; not another engineer', async () => {
      const { fixture, request, attachment } = await withFile();
      await fixture.service.assign(
        request.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );

      for (const actor of [SALES_A, MANAGER, ENGINEER_A]) {
        const download = await fixture.attachmentService.download(
          request.id,
          attachment.id,
          actor,
        );
        expect(download).toMatchObject({
          fileName: 'a.pdf',
          contentType: 'application/pdf',
        });
      }
      await expect(
        fixture.attachmentService.download(
          request.id,
          attachment.id,
          ENGINEER_B,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.attachmentService.list(request.id, ENGINEER_B),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not serve a file through another request’s id', async () => {
      const { fixture, attachment } = await withFile();
      const other = await createDraft(fixture, SALES_A);

      await expect(
        fixture.attachmentService.download(other.id, attachment.id, SALES_A),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('streams the stored bytes back', async () => {
      const { fixture, request, attachment } = await withFile();

      const download = await fixture.attachmentService.download(
        request.id,
        attachment.id,
        SALES_A,
      );
      const chunks: Buffer[] = [];
      for await (const chunk of download.stream) chunks.push(chunk as Buffer);

      expect(Buffer.concat(chunks).equals(PDF)).toBe(true);
    });

    it('answers 404 when the object has vanished from storage', async () => {
      const { fixture, request, attachment } = await withFile();
      fixture.stored.clear();

      await expect(
        fixture.attachmentService.download(request.id, attachment.id, SALES_A),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not expose the storage key in the listing', async () => {
      const { fixture, request } = await withFile();

      const [listed] = await fixture.attachmentService.list(
        request.id,
        SALES_A,
      );

      expect(listed).not.toHaveProperty('storageKey');
    });
  });

  describe('status gates', () => {
    it.each([
      RequestStatus.DRAFT,
      RequestStatus.ASSIGNED,
      RequestStatus.ESTIMATING,
    ])('accepts and removes files while the request is %s', async (status) => {
      const fixture = buildRequestFixture();
      const request = seedRequest(fixture, status);

      const saved = await fixture.attachmentService.upload(
        request.id,
        file('a.pdf', PDF),
        SALES_A,
      );
      await expect(
        fixture.attachmentService.remove(request.id, saved.id, SALES_A),
      ).resolves.toEqual({ id: saved.id });
      expect(fixture.stored.size).toBe(0);
    });

    it.each([
      RequestStatus.ESTIMATED,
      RequestStatus.QUOTED,
      RequestStatus.WON,
      RequestStatus.LOST,
      RequestStatus.CANCELLED,
    ])(
      'refuses to add or remove files once the request is %s (409)',
      async (status) => {
        const fixture = buildRequestFixture();
        const request = seedRequest(fixture, RequestStatus.DRAFT);
        const saved = await fixture.attachmentService.upload(
          request.id,
          file('a.pdf', PDF),
          SALES_A,
        );
        request.status = status;

        await expect(
          fixture.attachmentService.upload(
            request.id,
            file('b.pdf', PDF),
            SALES_A,
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          fixture.attachmentService.remove(request.id, saved.id, SALES_A),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(fixture.attachments.rows).toHaveLength(1);
        // The refused upload's object is taken back; only the first file remains.
        expect(fixture.stored.size).toBe(1);
      },
    );

    it('answers 404 for removing a file that is not on the request', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);

      await expect(
        fixture.attachmentService.remove(request.id, 999, SALES_A),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('records the removal on the timeline', async () => {
      const fixture = buildRequestFixture();
      const request = await draftWith(fixture);
      const saved = await fixture.attachmentService.upload(
        request.id,
        file('a.pdf', PDF),
        SALES_A,
      );

      await fixture.attachmentService.remove(request.id, saved.id, SALES_A);

      expect(fixture.activities.rows.at(-1)).toMatchObject({
        action: 'attachment_removed',
        note: 'a.pdf',
      });
    });
  });
});
