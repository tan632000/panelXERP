import {
  openQcHarness,
  type QcHarness,
  type ReadyUnit,
} from '@plugins/delivery/qc-inspection/qc-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

interface DefectBody {
  id: number;
  status: string;
  fixNote: string | null;
  fixedByName: string | null;
  verifiedByName: string | null;
}
interface UnitBody {
  qcStatus: string;
  defects: DefectBody[];
}

/**
 * The defect life cycle over HTTP against the real Postgres of the compose stack: who may fix,
 * who may verify, and that nobody verifies their own fix.
 */
describeWithDatabase('QC defects (real Postgres)', () => {
  jest.setTimeout(90_000);

  let qc: QcHarness;

  beforeAll(async () => {
    qc = await openQcHarness();
  });

  afterAll(async () => {
    await qc?.close();
  });

  /** A finished cabinet whose first round failed on one item: one open defect. */
  const failedUnit = async (): Promise<ReadyUnit & { defectId: number }> => {
    const ready = await qc.readyUnit();
    const res = await qc.submit(
      ready.unitId,
      { failing: [0] },
      'qcInspector',
      201,
    );
    return { ...ready, defectId: (res.body as UnitBody).defects[0].id };
  };
  const fix = (
    id: number,
    as: Parameters<QcHarness['h']['post']>[2],
    note = 'Re-torqued',
  ) => qc.h.post(`/delivery/qc/defects/${id}/fix`, { note }, as);
  const verify = (id: number, as: Parameters<QcHarness['h']['post']>[2]) =>
    qc.h.post(`/delivery/qc/defects/${id}/verify`, {}, as);

  it('lets only a production manager fix, and only an open defect', async () => {
    const { defectId } = await failedUnit();

    await fix(defectId, 'storekeeper').expect(403);
    await fix(defectId, 'qcInspector').expect(403);
    await fix(defectId, 'manager', '').expect(400);
    await fix(2147483000, 'manager').expect(404);

    const fixed = await fix(defectId, 'manager').expect(200);
    expect(fixed.body).toMatchObject({
      status: 'fixed',
      fixNote: 'Re-torqued',
      fixedByName: expect.any(String) as string,
    });
    await fix(defectId, 'manager').expect(409);
  });

  it('refuses to verify an open defect, and a verification by the one who fixed it', async () => {
    const { defectId } = await failedUnit();

    await verify(defectId, 'qcInspector').expect(409);
    await fix(defectId, 'manager').expect(200);
    // The production manager fixed it, so they cannot verify it too.
    await verify(defectId, 'manager').expect(409);
    await verify(defectId, 'storekeeper').expect(403);

    const verified = await verify(defectId, 'qcInspector').expect(200);
    expect(verified.body).toMatchObject({
      status: 'verified',
      verifiedByName: expect.any(String) as string,
    });
    await verify(defectId, 'qcInspector').expect(409);
  });

  it('lets an administrator verify what a production manager fixed', async () => {
    const { defectId } = await failedUnit();
    await fix(defectId, 'manager').expect(200);
    await verify(defectId, 'admin').expect(200);
  });

  it('allows a new round once every defect is verified, and that round can pass the cabinet', async () => {
    const { unitId, defectId } = await failedUnit();
    await qc.submit(unitId, {}, 'qcInspector', 409);

    await fix(defectId, 'manager').expect(200);
    await qc.submit(unitId, {}, 'qcInspector', 409);
    await verify(defectId, 'qcInspector').expect(200);

    const res = await qc.submit(unitId, {}, 'qcInspector', 201);
    expect((res.body as UnitBody).qcStatus).toBe('passed');
  });

  it('lists defects by status and cabinet', async () => {
    const { unitId, defectId } = await failedUnit();
    const list = async (query: string) =>
      (await qc.h.get(`/delivery/qc/defects?${query}`).expect(200)).body as {
        data: DefectBody[];
        meta: { total: number };
      };

    expect(
      (await list(`unitId=${unitId}&status=open`)).data.map((d) => d.id),
    ).toEqual([defectId]);
    expect((await list(`unitId=${unitId}&status=fixed`)).meta.total).toBe(0);
    await qc.h.get(`/delivery/qc/defects?status=late`).expect(400);
  });
});
