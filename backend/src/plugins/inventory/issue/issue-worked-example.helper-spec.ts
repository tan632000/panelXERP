import { Decimal } from 'decimal.js';

import type { IssueHarness } from '@plugins/inventory/issue/issue-db.helper-spec';

const exact = (text: string) => new Decimal(text).toFixed();

export interface IssueWorld {
  x: number;
  o1: number;
  o2: number;
}

/** On hand and value of the item as exact text. */
export async function stockOf(
  h: IssueHarness,
  itemId: number,
): Promise<{ onHand: string; value: string }> {
  const totals = await h.db.totals(itemId);
  return { onHand: exact(totals.onHand), value: exact(totals.value) };
}

/**
 * Steps 1–4 of the task's worked example, each asserted: item X with 10 on hand worth
 * 1 000 000; O1 (2026-11-05) needs 6 and holds 6, O2 (2026-11-10) needs 6 and holds 4. Named
 * `*.helper-spec.ts` so the build leaves it out and jest does not run it as a test.
 */
export async function playIssueSteps(h: IssueHarness): Promise<IssueWorld> {
  const x = await h.db.createItem();
  await h.stockOf(x, '10', 100000);
  const o1 = (
    await h.kit.createOrder({
      deliveryDate: '2026-11-05',
      bom: [{ itemId: x, perPanel: '6' }],
    })
  ).orderId;
  const o2 = (
    await h.kit.createOrder({
      deliveryDate: '2026-11-10',
      bom: [{ itemId: x, perPanel: '6' }],
    })
  ).orderId;
  expect(await h.kit.reservationsOf(x)).toEqual({ [o1]: '6', [o2]: '4' });

  // 1. Issue O1 X 4 at the average 100 000.
  await h.issue(o1, [{ itemId: x, quantity: 4 }]).expect(201);
  expect(await h.kit.reservationsOf(x)).toEqual({ [o1]: '2', [o2]: '4' });
  expect(await stockOf(h, x)).toEqual({ onHand: '6', value: '600000' });

  // 2. X 3 would need 1 of O2's reservation: refused even with a reason. Then X 2.
  await h
    .issue(o1, [{ itemId: x, quantity: 3, reason: 'Hỏng khi lắp' }])
    .expect(409);
  expect(await h.kit.reservationsOf(x)).toEqual({ [o1]: '2', [o2]: '4' });
  await h.issue(o1, [{ itemId: x, quantity: 2 }]).expect(201);
  expect(await h.kit.reservationsOf(x)).toEqual({ [o2]: '4' });
  expect(await stockOf(h, x)).toEqual({ onHand: '4', value: '400000' });
  expect(await h.netIssued(o1, x)).toBe('6');

  // 3. Receipt X 3 @ 130 000: O2 takes the 2 it lacked, 1 stays free.
  await h.receive(x, '3', 130000);
  expect(await stockOf(h, x)).toEqual({ onHand: '7', value: '790000' });
  expect(await h.kit.reservationsOf(x)).toEqual({ [o2]: '6' });

  // 4. Beyond the BOM: refused without a reason, then issued at the average 112 857.1429.
  await h.issue(o1, [{ itemId: x, quantity: 1 }]).expect(400);
  await h
    .issue(o1, [{ itemId: x, quantity: 1, reason: 'Thay dây đứt' }])
    .expect(201);
  expect(await stockOf(h, x)).toEqual({ onHand: '6', value: '677143' });
  expect(await h.netIssued(o1, x)).toBe('7');

  return { x, o1, o2 };
}
