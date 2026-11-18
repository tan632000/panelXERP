import { ConflictException } from '@nestjs/common';

import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  openQcHarness,
  roundBody,
  type QcHarness,
} from '@plugins/delivery/qc-inspection/qc-db.helper-spec';
import { QcInspectionService } from '@plugins/delivery/qc-inspection/services/qc-inspection.service';
import {
  PRODUCTION_STAGES,
  ProductionStage,
} from '@plugins/production/production-order/enums/production-stage.enum';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';
import {
  releasedOrder,
  runStages,
  stagePath,
} from '@plugins/production/progress/progress-db.helper-spec';

interface DetailBody {
  unitId: number;
  qcStatus: string;
  rounds: Array<{
    roundNo: number;
    result: string;
    items: Array<{
      checklistItemId: number;
      name: string;
      result: string;
      note: string | null;
    }>;
  }>;
  defects: Array<{ id: number; status: string; description: string }>;
}
interface PageBody {
  data: Array<{ unitId: number; qcStatus: string; orderCode: string | null }>;
  meta: { total: number; page: number; limit: number };
}
const detail = (res: { body: unknown }) => res.body as DetailBody;
const messageOf = (res: { body: unknown }) =>
  (res.body as { message?: string }).message ?? '';

class Rollback extends Error {}

/**
 * QC rounds over HTTP against the real Postgres of the compose stack: when a round is allowed,
 * the snapshot of the checklist, the defects a failure opens, the notices, and the data scope of
 * every read.
 */
describeWithDatabase('QC rounds (real Postgres)', () => {
  jest.setTimeout(90_000);

  let qc: QcHarness;
  let items: number[];

  beforeAll(async () => {
    qc = await openQcHarness();
    items = await qc.itemIds();
  });

  afterAll(async () => {
    await qc?.close();
  });

  const unit = (
    unitId: number,
    as: 'qcInspector' | 'salesA' | 'salesB' = 'qcInspector',
  ) => qc.h.get(`/delivery/qc/units/${unitId}`, as);

  it('stops production from undoing finishing or cancelling the order once a cabinet has a round', async () => {
    const ready = await qc.readyUnit();
    const finishing = async () => {
      const [row]: Array<{ status: string }> = await qc.h.dataSource.query(
        `SELECT status FROM production_unit_stages WHERE unit_id = $1 AND stage = 'finishing'`,
        [ready.unitId],
      );
      return row.status;
    };
    const undo = () =>
      qc.h.post(
        stagePath(ready.unitId, ProductionStage.FINISHING, 'undo'),
        { reason: 'Redo' },
        'manager',
      );

    // Without a round the undo goes through; the cabinet is then finished again.
    await undo().expect(200);
    expect(await finishing()).toBe('in_progress');
    await qc.h
      .post(
        stagePath(ready.unitId, ProductionStage.FINISHING, 'finish'),
        {},
        'techA',
      )
      .expect(200);

    await qc.submit(ready.unitId, {}, 'qcInspector', 201);
    await undo().expect(409);
    expect(await finishing()).toBe('done');
    await qc.h
      .post(`/production/orders/${ready.id}/cancel`, { reason: 'Redesign' })
      .expect(409);
    expect(await qc.h.statusOfProduction(ready.id)).toBe('released');
    expect(await qc.h.statusOfOrder(ready.orderId)).toBe('in_production');
  });

  it('starts with the migrated checklist, so a round has something to answer', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  it('refuses a round on a cabinet whose finishing is not done, or whose production order is cancelled', async () => {
    const open = await releasedOrder(qc.h);
    await runStages(qc.h, open.units[0].id, PRODUCTION_STAGES, 'techA', true);
    expect(
      messageOf(await qc.round(open.units[0].id, roundBody(items)).expect(409)),
    ).toContain('not_ready');
    expect(detail(await unit(open.units[0].id).expect(200)).qcStatus).toBe(
      'not_ready',
    );

    const gone = await qc.readyUnit();
    await qc.h
      .post(`/production/orders/${gone.id}/cancel`, { reason: 'Redesign' })
      .expect(200);
    expect(
      messageOf(await qc.round(gone.unitId, roundBody(items)).expect(409)),
    ).toContain('not_ready');
  });

  it('refuses a round while every checklist item is hidden (nothing to snapshot)', async () => {
    const ready = await qc.readyUnit();
    const service = qc.h.app.get(QcInspectionService);
    // Hidden inside a transaction that is rolled back: no other suite ever sees the empty template.
    await expect(
      qc.h.dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE qc_checklist_items SET active = false WHERE is_deleted = false`,
        );
        await service.recordRound(
          manager,
          ready.unitId,
          { results: [] },
          qc.h.actors.qcInspector,
        );
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses results that differ from the active items: a missing one, an unknown one, a repeated one', async () => {
    const ready = await qc.readyUnit();
    await qc.withStableTemplate(async () => {
      const active = await qc.itemIds();
      const refused = async (body: object) =>
        messageOf(await qc.round(ready.unitId, body).expect(409));
      expect(await refused(roundBody(active.slice(1)))).toContain(
        'checklist changed',
      );
      expect(
        await refused(roundBody([...active.slice(1), 2147483000])),
      ).toContain('checklist changed');
      expect(await refused(roundBody([...active, active[0]]))).toContain(
        'checklist changed',
      );
      expect(await refused({ results: [] })).toContain('checklist changed');
    });
    expect(detail(await unit(ready.unitId).expect(200)).rounds).toEqual([]);
  });

  it('stores a passed round as a snapshot, marks the cabinet passed and tells the storekeeper only', async () => {
    const ready = await qc.readyUnit();
    const res = await qc.submit(ready.unitId, { na: [0] }, 'qcInspector', 201);

    const body = detail(res);
    expect(body.qcStatus).toBe('passed');
    expect(body.rounds).toHaveLength(1);
    expect(body.rounds[0].result).toBe('passed');
    expect(body.rounds[0].items.map((item) => item.result)).toEqual(
      body.rounds[0].items.map((_, index) => (index === 0 ? 'na' : 'pass')),
    );
    expect(body.rounds[0].items.length).toBeGreaterThan(1);
    expect(body.defects).toEqual([]);

    expect(
      (await qc.h.notices('storekeeper', ready.orderId)).map(
        (notice) => notice.eventType,
      ),
    ).toContain('qc.unit.passed');
    expect(
      (await qc.h.notices('manager', ready.orderId)).map(
        (notice) => notice.eventType,
      ),
    ).not.toContain('qc.unit.passed');
  });

  it('keeps the names a round copied when the template is renamed afterwards', async () => {
    const ready = await qc.readyUnit();
    const submitted = detail(
      await qc.submit(ready.unitId, {}, 'qcInspector', 201),
    );
    const copied = submitted.rounds[0].items.map((item) => item.name);
    const copiedIds = submitted.rounds[0].items.map(
      (item) => item.checklistItemId,
    );

    let seen: string[] = [];
    await expect(
      qc.h.dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE qc_checklist_items SET name = name || ' (renamed)' WHERE id = ANY($1)`,
          [copiedIds],
        );
        const rows: Array<{ name: string }> = await manager.query(
          `SELECT it.name FROM qc_round_items it JOIN qc_rounds r ON r.id = it.round_id
            WHERE r.unit_id = $1 ORDER BY it.position, it.id`,
          [ready.unitId],
        );
        seen = rows.map((row) => row.name);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    expect(seen).toEqual(copied);
    expect(seen.some((name) => name.includes('(renamed)'))).toBe(false);
  });

  it('opens one defect per failed item, fails the cabinet and tells the production manager only', async () => {
    const ready = await qc.readyUnit();
    const res = await qc.submit(
      ready.unitId,
      { failing: [0, 1] },
      'qcInspector',
      201,
    );

    const body = detail(res);
    expect(body.qcStatus).toBe('failed');
    expect(body.rounds[0].result).toBe('failed');
    expect(body.defects.map((defect) => defect.status)).toEqual([
      'open',
      'open',
    ]);
    // One defect per failed item, its description the note typed on that item.
    const failedNotes = body.rounds[0].items
      .filter((item) => item.result === 'fail')
      .map((item) => item.note);
    expect(failedNotes).toHaveLength(2);
    expect(body.defects.map((defect) => defect.description).sort()).toEqual(
      [...failedNotes].sort(),
    );

    expect(
      (await qc.h.notices('manager', ready.orderId)).map(
        (notice) => notice.eventType,
      ),
    ).toContain('qc.unit.failed');
    expect(
      (await qc.h.notices('storekeeper', ready.orderId)).map(
        (notice) => notice.eventType,
      ),
    ).not.toContain('qc.unit.failed');
  });

  it('needs a note on a failed item, refuses a new round while a defect is unverified and after a pass', async () => {
    const ready = await qc.readyUnit();
    const noNote = {
      results: items.map((checklistItemId, index) => ({
        checklistItemId,
        result: index === 0 ? 'fail' : 'pass',
      })),
    };
    await qc.round(ready.unitId, noNote).expect(400);
    await qc
      .round(ready.unitId, {
        results: noNote.results.map((r) =>
          r.result === 'fail' ? { ...r, note: '   ' } : r,
        ),
      })
      .expect(400);

    await qc.submit(ready.unitId, { failing: [0] }, 'qcInspector', 201);
    await qc.submit(ready.unitId, {}, 'qcInspector', 409);

    const second = await qc.readyUnit();
    await qc.submit(second.unitId, {}, 'qcInspector', 201);
    await qc.submit(second.unitId, {}, 'qcInspector', 409);
  });

  it('shows a cabinet only to the owner of its order, and refuses a write to anyone without the grant', async () => {
    const ready = await qc.readyUnit();
    await qc.submit(ready.unitId, { failing: [0] }, 'qcInspector', 201);

    await unit(ready.unitId, 'salesA').expect(200);
    await unit(ready.unitId, 'salesB').expect(404);
    const defectsOf = async (as: 'salesA' | 'salesB') =>
      (
        await qc.h
          .get(`/delivery/qc/defects?unitId=${ready.unitId}`, as)
          .expect(200)
      ).body as { meta: { total: number } };
    expect((await defectsOf('salesA')).meta.total).toBe(1);
    expect((await defectsOf('salesB')).meta.total).toBe(0);

    // Sales may read QC but never record it; a technician holds no QC grant at all.
    await qc.round(ready.unitId, roundBody(items), 'salesA').expect(403);
    await unit(ready.unitId, 'salesA').expect(200);
    await qc.h.get(`/delivery/qc/units/${ready.unitId}`, 'techA').expect(403);
    await qc.h.get(`/delivery/qc/units`, 'techA').expect(403);
  });

  it('pages the cabinets, filters by QC status and carries no money key', async () => {
    const ready = await qc.readyUnit();
    const list = async (
      query: string,
      as: 'qcInspector' | 'salesA' = 'qcInspector',
    ) =>
      (
        await qc.h
          .get(`/delivery/qc/units?orderId=${ready.orderId}&${query}`, as)
          .expect(200)
      ).body as PageBody;

    const first = await list('limit=1&page=1');
    const second = await list('limit=1&page=2');
    expect(first.meta).toMatchObject({ total: 2, page: 1, limit: 1 });
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    expect(second.data[0].unitId).not.toBe(first.data[0].unitId);
    expect(first.data[0].orderCode).toEqual(expect.any(String));

    expect(
      (await list('qcStatus=waiting')).data.map((row) => row.unitId),
    ).toEqual([ready.unitId]);
    expect(
      (await list('qcStatus=not_ready')).data.map((row) => row.unitId),
    ).toEqual([ready.otherUnitId]);
    expect((await list('qcStatus=passed')).data).toEqual([]);
    await qc.h.get(`/delivery/qc/units?qcStatus=late`).expect(400);

    await qc.submit(ready.unitId, { failing: [0] }, 'qcInspector', 201);
    for (const as of [
      'qcInspector',
      'manager',
      'storekeeper',
      'salesA',
    ] as const) {
      expectNoMoneyKeys((await list('', as)).data);
    }
    expectNoMoneyKeys((await unit(ready.unitId)).body);
    expectNoMoneyKeys(
      (await qc.h.get(`/delivery/qc/defects?unitId=${ready.unitId}`)).body,
    );
  });
});
