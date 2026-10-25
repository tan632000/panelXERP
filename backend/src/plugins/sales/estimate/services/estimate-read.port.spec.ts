import {
  buildEstimateFixture,
  type EstimateFixture,
} from '@plugins/sales/estimate/estimate-fixture.helper-spec';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import { ENGINEER_A } from '@plugins/sales/request/request-fixture.helper-spec';

/** A request with a draft estimate holding one panel (quantity 2) and one 3 × 1,000 line. */
async function draftEstimate(fixture: EstimateFixture) {
  const request = fixture.requestAt(RequestStatus.ASSIGNED);
  const estimate = await fixture.service.create(
    { requestId: request.id },
    ENGINEER_A,
  );
  const item = fixture.itemOf({ referencePrice: 1000 });
  const view = await fixture.editor.addPanel(
    estimate.id,
    { tag: 'MSB-01', quantity: 2 },
    ENGINEER_A,
  );
  await fixture.editor.addBomLine(
    estimate.id,
    view.panels[0].id,
    { itemId: item.id, quantity: 3 },
    ENGINEER_A,
  );
  await fixture.editor.addCostLine(
    estimate.id,
    view.panels[0].id,
    { category: 'labor' as never, amount: 500 },
    ENGINEER_A,
  );
  return { request, estimate, item };
}

describe('EstimateReadPort', () => {
  const read = (fixture: EstimateFixture, requestId: number) =>
    fixture.readPort.getLatestSubmitted(fixture.manager as never, requestId);

  it('has nothing for a request that was never estimated', async () => {
    const fixture = buildEstimateFixture();
    const request = fixture.requestAt(RequestStatus.ASSIGNED);

    await expect(read(fixture, request.id)).resolves.toBeNull();
  });

  it('shows no draft: a quotation cannot be built on figures still being edited', async () => {
    const fixture = buildEstimateFixture();
    const { request } = await draftEstimate(fixture);

    await expect(read(fixture, request.id)).resolves.toBeNull();
  });

  it('returns the submitted revision with panel totals, item snapshots and cost lines', async () => {
    const fixture = buildEstimateFixture();
    const { request, estimate, item } = await draftEstimate(fixture);
    await fixture.service.submit(estimate.id, ENGINEER_A);

    const submitted = await read(fixture, request.id);

    expect(submitted).toMatchObject({
      estimateId: estimate.id,
      code: estimate.code,
      requestId: request.id,
      revision: 1,
      // (3 × 1,000 + 500) × 2 panels
      total: 7000,
      panels: [
        {
          tag: 'MSB-01',
          quantity: 2,
          unitCost: 3500,
          total: 7000,
          bomLines: [
            {
              itemId: item.id,
              itemCode: item.code,
              itemName: item.name,
              itemUnit: 'Cái',
              quantity: 3,
              unitCost: 1000,
              amount: 3000,
            },
          ],
          costLines: [{ category: 'labor', amount: 500 }],
        },
      ],
    });
    expect(submitted?.submittedAt).toBeInstanceOf(Date);
  });

  it('keeps returning revision 1 while revision 2 is a draft, and revision 2 once submitted', async () => {
    const fixture = buildEstimateFixture();
    const { request, estimate } = await draftEstimate(fixture);
    await fixture.service.submit(estimate.id, ENGINEER_A);
    const revised = await fixture.service.revise(estimate.id, ENGINEER_A);
    await fixture.editor.updatePanel(
      estimate.id,
      revised.current.panels[0].id,
      { quantity: 5 },
      ENGINEER_A,
    );

    expect((await read(fixture, request.id))?.revision).toBe(1);
    expect((await read(fixture, request.id))?.total).toBe(7000);

    await fixture.service.submit(estimate.id, ENGINEER_A);

    const latest = await read(fixture, request.id);
    expect(latest?.revision).toBe(2);
    expect(latest?.total).toBe(17500);
  });

  it('holds the estimate row FOR SHARE only when asked to lock', async () => {
    const fixture = buildEstimateFixture();
    const { request, estimate } = await draftEstimate(fixture);
    await fixture.service.submit(estimate.id, ENGINEER_A);
    fixture.estimates.findOne.mockClear();

    await fixture.readPort.getLatestSubmitted(
      fixture.manager as never,
      request.id,
    );
    expect(fixture.estimates.findOne).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ lock: expect.anything() as unknown }),
    );

    const locked = await fixture.readPort.getLatestSubmitted(
      fixture.manager as never,
      request.id,
      { lock: true },
    );
    expect(locked?.revision).toBe(1);
    expect(fixture.estimates.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_read' } }),
    );
  });
});
