import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import {
  openQcHarness,
  roundBody,
  type QcHarness,
  type ReadyUnit,
} from '@plugins/delivery/qc-inspection/qc-db.helper-spec';
import { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';
import { stagePath } from '@plugins/production/progress/progress-db.helper-spec';

const HEADER_LOCK = `SELECT id FROM production_orders WHERE id = $1 FOR UPDATE`;

/**
 * QC against production at the same moment, on the real Postgres of the compose stack. A holder
 * keeps the production order header while both contenders queue behind it, so they run one after
 * the other in the order they were started; the second must see what the first committed.
 */
describeWithDatabase('QC races (real Postgres)', () => {
  jest.setTimeout(90_000);

  let qc: QcHarness;

  beforeAll(async () => {
    qc = await openQcHarness();
  });

  afterAll(async () => {
    await qc?.close();
  });

  const round = (unitId: number) => async () =>
    (await qc.round(unitId, roundBody(await qc.itemIds()))).status;
  const undoFinishing = (unitId: number) => async () =>
    (
      await qc.h.post(
        stagePath(unitId, ProductionStage.FINISHING, 'undo'),
        { reason: 'Redo' },
        'manager',
      )
    ).status;

  // No other suite may edit the template while the contenders run, or a round could answer
  // "checklist changed" instead of what the race is about.
  const race = (ready: ReadyUnit, contenders: Array<() => Promise<number>>) =>
    qc.withStableTemplate(() =>
      queuedBehind(qc.h.dataSource, HEADER_LOCK, [ready.id], contenders).then(
        (settled) =>
          settled.map((outcome) =>
            outcome.status === 'fulfilled' ? outcome.value : -1,
          ),
      ),
    );

  const roundRows = async (unitId: number) => {
    const [row]: Array<{ n: string }> = await qc.h.dataSource.query(
      `SELECT COUNT(*) AS n FROM qc_rounds WHERE unit_id = $1`,
      [unitId],
    );
    return Number(row.n);
  };
  const finishing = async (unitId: number) => {
    const [row]: Array<{ status: string }> = await qc.h.dataSource.query(
      `SELECT status FROM production_unit_stages WHERE unit_id = $1 AND stage = 'finishing'`,
      [unitId],
    );
    return row.status;
  };

  it('lets the first of two rounds on one waiting cabinet win; the second sees it and answers 409', async () => {
    const ready = await qc.readyUnit();
    expect(
      await race(ready, [round(ready.unitId), round(ready.unitId)]),
    ).toEqual([201, 409]);
    expect(await roundRows(ready.unitId)).toBe(1);
  });

  it('undo first, round second: the undo succeeds, the round answers 409 and writes nothing', async () => {
    const ready = await qc.readyUnit();
    expect(
      await race(ready, [undoFinishing(ready.unitId), round(ready.unitId)]),
    ).toEqual([200, 409]);
    expect(await roundRows(ready.unitId)).toBe(0);
    expect(await finishing(ready.unitId)).toBe('in_progress');
  });

  it('round first, undo second: the round is recorded and the undo answers 409', async () => {
    const ready = await qc.readyUnit();
    expect(
      await race(ready, [round(ready.unitId), undoFinishing(ready.unitId)]),
    ).toEqual([201, 409]);
    expect(await roundRows(ready.unitId)).toBe(1);
    expect(await finishing(ready.unitId)).toBe('done');
  });
});
