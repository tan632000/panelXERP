import {
  JPEG,
  PDF,
  PNG,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import {
  openDeliveryHarness,
  type DeliveryHarness,
} from '@plugins/delivery/delivery-note/delivery-note-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

interface ReceivedNote {
  status: string;
  files: Array<{ id: number; fileName: string; contentType: string }>;
}

/**
 * The handover files of a receipt against the real Postgres of the compose stack: what is
 * accepted, what is stored under which key, what happens to the objects when the receipt fails,
 * and that nothing is stored for a note the actor cannot see.
 */
describeWithDatabase('DeliveryNoteFileService (real Postgres)', () => {
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

  const shipped = async () => {
    const f = await d.readyOrder({ finished: 1 });
    return { f, note: await d.shippedNote(f.orderId, f.passedUnitIds) };
  };
  const fileRows = async (noteId: number) => {
    const [row]: Array<{ n: string }> = await d.h.dataSource.query(
      `SELECT COUNT(*) AS n FROM delivery_note_files WHERE note_id = $1`,
      [noteId],
    );
    return Number(row.n);
  };

  it('stores PDF, PNG and JPEG handover files under random keys with the type found in the content', async () => {
    const { note } = await shipped();

    const res = await d
      .receive(note.id, {
        files: [
          { name: 'minutes.pdf', bytes: PDF },
          { name: 'site.png', bytes: PNG },
          { name: 'site.JPEG', bytes: JPEG },
        ],
      })
      .expect(200);

    const received = res.body as ReceivedNote;
    expect(received.files.map((file) => file.contentType)).toEqual([
      'application/pdf',
      'image/png',
      'image/jpeg',
    ]);
    const keys = [...d.storage.objects.keys()];
    expect(keys).toHaveLength(3);
    for (const key of keys) {
      expect(key).toMatch(
        new RegExp(
          `^delivery/handover/${note.id}/[0-9a-f-]{36}\\.(pdf|png|jpg)$`,
        ),
      );
    }
    expect(JSON.stringify(res.body)).not.toMatch(/storage|delivery\/handover/i);
    expect(await fileRows(note.id)).toBe(3);
  });

  it('refuses a PNG renamed to .pdf, an unknown type and six files, storing nothing', async () => {
    const { note } = await shipped();

    await d
      .receive(note.id, { files: [{ name: 'minutes.pdf', bytes: PNG }] })
      .expect(400);
    await d
      .receive(note.id, { files: [{ name: 'minutes.exe', bytes: PDF }] })
      .expect(400);
    await d
      .receive(note.id, {
        files: Array.from({ length: 6 }, (_, i) => ({
          name: `minutes-${i}.pdf`,
          bytes: PDF,
        })),
      })
      .expect(400);

    expect(d.storage.upload).not.toHaveBeenCalled();
    expect(await fileRows(note.id)).toBe(0);
    expect(await d.statusOfNote(note.id)).toBe('shipped');
  });

  it('accepts five files', async () => {
    const { note } = await shipped();

    await d
      .receive(note.id, {
        files: Array.from({ length: 5 }, (_, i) => ({
          name: `minutes-${i}.pdf`,
          bytes: PDF,
        })),
      })
      .expect(200);

    expect(await fileRows(note.id)).toBe(5);
  });

  it('deletes every object and writes no row when the storage fails after the first of two files', async () => {
    const { note } = await shipped();
    const store = d.storage.upload.getMockImplementation();
    if (!store) throw new Error('The storage fake has no implementation');
    d.storage.upload
      .mockImplementationOnce(store)
      .mockImplementationOnce(() => Promise.reject(new Error('Storage down')));

    await d
      .receive(note.id, {
        files: [
          { name: 'a.pdf', bytes: PDF },
          { name: 'b.pdf', bytes: PDF },
        ],
      })
      .expect(500);

    expect(d.storage.objects.size).toBe(0);
    expect(d.storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(await fileRows(note.id)).toBe(0);
    expect(await d.statusOfNote(note.id)).toBe('shipped');
  });

  it('answers 404 to another sales rep and stores nothing', async () => {
    const { note } = await shipped();
    const grant = d.h.actors.salesB;
    const before = grant.permissions;
    grant.permissions = [...before, 'delivery_note:receive'];
    try {
      await d.receive(note.id, {}, 'salesB').expect(404);
    } finally {
      grant.permissions = before;
    }

    expect(d.storage.upload).not.toHaveBeenCalled();
    expect(await fileRows(note.id)).toBe(0);
    expect(await d.statusOfNote(note.id)).toBe('shipped');
  });

  it('refuses a role without the receive permission', async () => {
    const { note } = await shipped();

    await d.receive(note.id, {}, 'manager').expect(403);
    await d.receive(note.id, {}, 'techA').expect(403);

    expect(d.storage.upload).not.toHaveBeenCalled();
  });
});
