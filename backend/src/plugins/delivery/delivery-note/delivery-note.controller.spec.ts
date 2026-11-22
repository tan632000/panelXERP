import { PDF } from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openDeliveryHarness,
  type DeliveryHarness,
} from '@plugins/delivery/delivery-note/delivery-note-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

const MB = 1024 * 1024;

/** A PDF of an exact size: the signature then padding. */
const pdfOfSize = (bytes: number) =>
  Buffer.concat([PDF, Buffer.alloc(Math.max(0, bytes - PDF.length), 0x20)]);

/**
 * The delivery note routes over HTTP against the real Postgres of the compose stack: the size
 * limit of the multipart parser, the headers of the content route and who may read a file.
 */
describeWithDatabase('Delivery note routes (real Postgres)', () => {
  jest.setTimeout(180_000);

  let d: DeliveryHarness;

  beforeAll(async () => {
    d = await openDeliveryHarness();
  });

  afterAll(async () => {
    await d?.close();
  });

  beforeEach(() => {
    d.storage.objects.clear();
    d.storage.upload.mockClear();
    d.storage.deleteObject.mockClear();
  });

  const receivedNote = async (fileName = 'minutes.pdf') => {
    const f = await d.readyOrder({ finished: 1 });
    const note = await d.shippedNote(f.orderId, f.passedUnitIds);
    const res = await d
      .receive(note.id, { files: [{ name: fileName, bytes: PDF }] })
      .expect(200);
    const { files } = res.body as { files: Array<{ id: number }> };
    return { ...f, noteId: note.id, fileId: files[0].id };
  };
  const content = (noteId: number, fileId: number, as?: 'salesA') =>
    d.get(`/delivery/notes/${noteId}/files/${fileId}/content`, as);

  describe('the size limit', () => {
    it('refuses 20 MB plus one byte with 413 and stores nothing', async () => {
      const f = await d.readyOrder({ finished: 1 });
      const note = await d.shippedNote(f.orderId, f.passedUnitIds);

      await d
        .receive(note.id, {
          files: [{ name: 'big.pdf', bytes: pdfOfSize(20 * MB + 1) }],
        })
        .expect(413);

      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.statusOfNote(note.id)).toBe('shipped');
    });

    it('accepts exactly 20 MB', async () => {
      const f = await d.readyOrder({ finished: 1 });
      const note = await d.shippedNote(f.orderId, f.passedUnitIds);

      await d
        .receive(note.id, {
          files: [{ name: 'big.pdf', bytes: pdfOfSize(20 * MB) }],
        })
        .expect(200);
    });
  });

  describe('the content route', () => {
    it('serves the stored type as an attachment that the browser may not sniff', async () => {
      const r = await receivedNote('Biên bản.pdf');

      const res = await content(r.noteId, r.fileId).expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="[^"]*"; filename\*=UTF-8''/,
      );
      expect(res.headers['content-disposition']).toContain(
        encodeURIComponent('Biên bản.pdf'),
      );
    });

    it('lets the order owner read it and hides it from another sales rep', async () => {
      const r = await receivedNote();

      await content(r.noteId, r.fileId, 'salesA').expect(200);
      await d
        .get(`/delivery/notes/${r.noteId}/files/${r.fileId}/content`, 'salesB')
        .expect(404);
    });

    it('answers 404 for a file that belongs to another note, a missing file and a missing note', async () => {
      const first = await receivedNote();
      const second = await receivedNote();

      await content(first.noteId, second.fileId).expect(404);
      await content(first.noteId, 2147483000).expect(404);
      await content(2147483000, first.fileId).expect(404);
    });

    it('answers 404 when the object is gone from storage', async () => {
      const r = await receivedNote();
      d.storage.objects.clear();

      await content(r.noteId, r.fileId).expect(404);
    });

    it('refuses a technician and a caller without delivery_note:read', async () => {
      const r = await receivedNote();

      await d
        .get(`/delivery/notes/${r.noteId}/files/${r.fileId}/content`, 'techA')
        .expect(403);
      await d
        .get(
          `/delivery/notes/${r.noteId}/files/${r.fileId}/content`,
          'qcInspector',
        )
        .expect(403);
    });
  });
});
