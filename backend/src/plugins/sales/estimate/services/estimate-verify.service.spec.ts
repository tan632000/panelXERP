import { ConflictException, NotFoundException } from '@nestjs/common';

import { findMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  buildEstimateFixture,
  PRICER_SALES_A,
  type EstimateFixture,
} from '@plugins/sales/estimate/estimate-fixture.helper-spec';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import {
  ENGINEER_A,
  ENGINEER_B,
} from '@plugins/sales/request/request-fixture.helper-spec';

const ADMIN = {
  userId: 1,
  role: 'admin',
  permissions: ['*:*'],
};

/**
 * A draft estimate of one panel holding two manual lines and two AI lines, the way the AI run
 * will leave it: the AI columns are set on the rows directly, since only the writer of the AI
 * run sets them.
 */
async function aiDraft(fixture: EstimateFixture) {
  const request = fixture.requestAt(RequestStatus.ASSIGNED);
  const estimate = await fixture.service.create(
    { requestId: request.id },
    ENGINEER_A,
  );
  const view = await fixture.editor.addPanel(
    estimate.id,
    { tag: 'MSB-01', quantity: 2 },
    ENGINEER_A,
  );
  const panelId = view.panels[0].id;
  const lineIds: number[] = [];
  for (const quantity of [1, 2, 3]) {
    const item = fixture.itemOf({ referencePrice: 1000 });
    const next = await fixture.editor.addBomLine(
      estimate.id,
      panelId,
      { itemId: item.id, quantity },
      ENGINEER_A,
    );
    lineIds.push(Math.max(...next.panels[0].bomLines.map((line) => line.id)));
  }
  const [manualId, aiOneId, aiTwoId] = lineIds;
  for (const row of fixture.bomLines.rows) {
    const isAi = row.id === aiOneId || row.id === aiTwoId;
    Object.assign(row, {
      isAiGenerated: isAi,
      isVerified: false,
      aiConfidence: isAi ? 0.8 : null,
      aiNote: isAi ? `matched ${row.itemCode}` : null,
    });
  }
  Object.assign(fixture.panels.rows[0], {
    isAiGenerated: true,
    aiNote: 'panel note',
  });
  return { request, estimate, panelId, manualId, aiOneId, aiTwoId };
}

const lineRow = (fixture: EstimateFixture, id: number) =>
  fixture.bomLines.rows.find((row) => row.id === id) as unknown as {
    isVerified: boolean;
    isAiGenerated: boolean;
  };

describe('EstimateVerifyService', () => {
  describe('unverifiedAiCount', () => {
    it('counts the AI lines of the revision nobody has verified yet', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await aiDraft(fixture);

      const detail = await fixture.service.findOne(estimate.id, ENGINEER_A);

      expect(detail.current.unverifiedAiCount).toBe(2);
      expect(detail.current.panels[0].bomLines[1]).toMatchObject({
        isAiGenerated: true,
        isVerified: false,
        aiConfidence: 0.8,
        aiNote: expect.stringContaining('matched') as string,
      });
      expect(detail.current.panels[0]).toMatchObject({
        isAiGenerated: true,
        aiNote: 'panel note',
      });
    });
  });

  describe('verifyBomLine', () => {
    it('verifies one AI line, is idempotent, and leaves the others alone', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, aiOneId, aiTwoId, manualId } = await aiDraft(fixture);

      const first = await fixture.verify.verifyBomLine(
        estimate.id,
        aiOneId,
        ENGINEER_A,
      );
      const again = await fixture.verify.verifyBomLine(
        estimate.id,
        aiOneId,
        ENGINEER_A,
      );

      expect(first.unverifiedAiCount).toBe(1);
      expect(again.unverifiedAiCount).toBe(1);
      expect(lineRow(fixture, aiOneId).isVerified).toBe(true);
      expect(lineRow(fixture, aiTwoId).isVerified).toBe(false);
      expect(lineRow(fixture, manualId).isVerified).toBe(false);
    });

    it('does not mark a manual line verified', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, manualId } = await aiDraft(fixture);

      const view = await fixture.verify.verifyBomLine(
        estimate.id,
        manualId,
        ENGINEER_A,
      );

      expect(lineRow(fixture, manualId).isVerified).toBe(false);
      expect(view.unverifiedAiCount).toBe(2);
    });

    it('answers 404 for a line of another estimate', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await aiDraft(fixture);

      await expect(
        fixture.verify.verifyBomLine(estimate.id, 9999, ENGINEER_A),
      ).rejects.toThrow(NotFoundException);
    });

    it('answers 404 for a real line of another estimate, and leaves that line unverified', async () => {
      const fixture = buildEstimateFixture();
      const mine = await aiDraft(fixture);
      const other = await aiDraft(fixture);

      await expect(
        fixture.verify.verifyBomLine(
          mine.estimate.id,
          other.aiOneId,
          ENGINEER_A,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(lineRow(fixture, other.aiOneId).isVerified).toBe(false);
    });

    it('keeps a quantity edit from verifying the line', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, aiOneId } = await aiDraft(fixture);

      await fixture.editor.updateBomLine(
        estimate.id,
        aiOneId,
        { quantity: 7 },
        ENGINEER_A,
      );

      expect(lineRow(fixture, aiOneId).isVerified).toBe(false);
      expect(lineRow(fixture, aiOneId).isAiGenerated).toBe(true);
    });
  });

  describe('verifyAll', () => {
    it('verifies every AI line of the draft and no manual line', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, aiOneId, aiTwoId, manualId } = await aiDraft(fixture);

      const view = await fixture.verify.verifyAll(estimate.id, ENGINEER_A);

      expect(view.unverifiedAiCount).toBe(0);
      expect(lineRow(fixture, aiOneId).isVerified).toBe(true);
      expect(lineRow(fixture, aiTwoId).isVerified).toBe(true);
      expect(lineRow(fixture, manualId).isVerified).toBe(false);
    });
  });

  describe('who may verify, and when', () => {
    it('answers 404 to engineer B, to the sales owner and to the administrator, and changes nothing', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, aiOneId } = await aiDraft(fixture);

      for (const actor of [ENGINEER_B, PRICER_SALES_A, ADMIN]) {
        await expect(
          fixture.verify.verifyAll(estimate.id, actor),
        ).rejects.toThrow(NotFoundException);
        await expect(
          fixture.verify.verifyBomLine(estimate.id, aiOneId, actor),
        ).rejects.toThrow(NotFoundException);
      }
      expect(lineRow(fixture, aiOneId).isVerified).toBe(false);
    });

    it('answers 409 once the revision is submitted', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, aiOneId } = await aiDraft(fixture);
      await fixture.service.submit(estimate.id, ENGINEER_A);

      await expect(
        fixture.verify.verifyBomLine(estimate.id, aiOneId, ENGINEER_A),
      ).rejects.toThrow(ConflictException);
      await expect(
        fixture.verify.verifyAll(estimate.id, ENGINEER_A),
      ).rejects.toThrow(ConflictException);
    });

    it('answers 409 while the request is not being estimated', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, request } = await aiDraft(fixture);
      Object.assign(
        fixture.requests.rows.filter((row) => row.id === request.id)[0],
        { status: RequestStatus.DRAFT },
      );

      await expect(
        fixture.verify.verifyAll(estimate.id, ENGINEER_A),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('a new revision', () => {
    it('keeps the AI columns and the verified flag of every copied panel and line', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, aiOneId } = await aiDraft(fixture);
      await fixture.verify.verifyBomLine(estimate.id, aiOneId, ENGINEER_A);
      await fixture.service.submit(estimate.id, ENGINEER_A);

      const revised = await fixture.service.revise(estimate.id, ENGINEER_A);

      const panel = revised.current.panels[0];
      expect(panel).toMatchObject({
        isAiGenerated: true,
        aiNote: 'panel note',
      });
      expect(
        panel.bomLines.map((line) => [
          line.isAiGenerated,
          line.isVerified,
          line.aiConfidence,
        ]),
      ).toEqual([
        [false, false, null],
        [true, true, 0.8],
        [true, false, 0.8],
      ]);
      expect(revised.current.unverifiedAiCount).toBe(1);
    });
  });

  describe('what an engineer may read', () => {
    it('holds no money key after a verify or a revise', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await aiDraft(fixture);

      const verified = await fixture.verify.verifyAll(estimate.id, ENGINEER_A);
      await fixture.service.submit(estimate.id, ENGINEER_A);
      const revised = await fixture.service.revise(estimate.id, ENGINEER_A);

      expect(findMoneyKeys(verified)).toEqual([]);
      expect(findMoneyKeys(revised)).toEqual([]);
    });
  });
});
