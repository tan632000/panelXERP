import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import * as requestActivity from '@plugins/sales/_shared/utils/request-activity.util';
import {
  describeWithDatabase,
  openQuotationDb,
  type PanelSpec,
  type QuotationDb,
} from '@plugins/sales/quotation/quotation-db.helper-spec';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

jest.setTimeout(60_000);

/**
 * The quotation's decisions against the real Postgres of the compose stack: submit, approve,
 * reject, confirm and cancel, the stale-estimate guard and its refresh, the request-close hook
 * and the races the header lock and `WHERE status = :expected` settle. Estimates are built
 * through the real estimate services.
 */
describeWithDatabase('Quotation approval against Postgres', () => {
  let db: QuotationDb;

  beforeAll(async () => {
    db = await openQuotationDb([Customer, Project, Contact, Item]);
  });
  beforeEach(() => {
    db.notifications.emit.mockClear();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.cleanup();
  });
  afterAll(async () => {
    await db?.close();
  });

  const quote = async (
    creator: AuthUserPayload = db.salesA,
    panels?: PanelSpec[],
  ) => {
    const estimated = await db.estimatedRequest(panels);
    const quotation = await db.quotations.create(
      { requestId: estimated.requestId },
      creator,
    );
    // The estimate's own notices are not what these specs count.
    db.notifications.emit.mockClear();
    return { ...estimated, quotation, id: quotation.id };
  };
  const submitted = async (creator: AuthUserPayload = db.salesA) => {
    const made = await quote(creator);
    await db.approvals.submit(made.id, creator);
    db.notifications.emit.mockClear();
    return made;
  };
  const approved = async () => {
    const made = await submitted();
    await db.approvals.approve(made.id, db.manager);
    db.notifications.emit.mockClear();
    return made;
  };

  const versionRows = (quotationId: number) =>
    db.dataSource.query<
      Array<{
        ver: number;
        status: string;
        decided_by: number | null;
        decision_reason: string | null;
      }>
    >(
      `SELECT ver, status, decided_by, decision_reason FROM sales_quotation_versions
       WHERE quotation_id = $1 ORDER BY ver`,
      [quotationId],
    );
  const statusOf = async (quotationId: number) =>
    (await versionRows(quotationId)).map((row) => row.status);
  const requestRow = async (id: number) =>
    (
      await db.dataSource.query<
        Array<{
          status: string;
          lost_reason: string | null;
          cancel_reason: string | null;
        }>
      >(
        `SELECT status, lost_reason, cancel_reason FROM sales_requests WHERE id = $1`,
        [id],
      )
    )[0];

  describe('submit', () => {
    it('moves draft to pending_approval and tells the approvers once, after the commit', async () => {
      const { id, quotation } = await quote();

      const detail = await db.approvals.submit(id, db.salesA);

      expect(detail.current.status).toBe('pending_approval');
      expect(await statusOf(id)).toEqual(['pending_approval']);
      expect(db.notifications.emit).toHaveBeenCalledTimes(1);
      expect(db.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'sales.quotation.submitted',
          roleCodes: ['salesManager', 'director', 'admin'],
          requiredScope: 'quotation:approve',
          payload: expect.objectContaining({
            quotationId: id,
            code: quotation.code,
            ver: 1,
          }) as unknown,
        }),
      );
    });

    it('lets a manager submit a draft someone else created', async () => {
      const { id } = await quote();

      await db.approvals.submit(id, db.manager);

      expect(await statusOf(id)).toEqual(['pending_approval']);
    });

    it('approves a director submission at once: request quoted, owner and sales managers told, no submitted notice', async () => {
      const { id, requestId } = await quote();

      const detail = await db.approvals.submit(id, db.director);

      expect(detail.current.status).toBe('approved');
      expect(detail.request.status).toBe('quoted');
      expect(await versionRows(id)).toEqual([
        expect.objectContaining({
          status: 'approved',
          decided_by: db.director.userId,
        }),
      ]);
      const activities = await db.dataSource.query<Array<{ action: string }>>(
        `SELECT action FROM sales_request_activities
          WHERE request_id = $1
            AND action IN ('quotation_submitted', 'quotation_approved') ORDER BY id`,
        [requestId],
      );
      expect(activities.map((row) => row.action)).toEqual([
        'quotation_submitted',
        'quotation_approved',
      ]);
      const events = (
        db.notifications.emit.mock.calls as Array<[{ eventType: string }]>
      ).map(([notice]) => notice);
      expect(events.map((notice) => notice.eventType)).toEqual([
        'sales.quotation.approved',
        'sales.quotation.approved',
      ]);
      expect(events[0]).toMatchObject({
        userIds: [db.salesA.userId],
        requiredScope: 'quotation:read',
      });
      expect(events[1]).toMatchObject({
        roleCodes: ['salesManager'],
        requiredScope: 'quotation:read',
        excludeUserIds: [db.director.userId, db.salesA.userId],
      });
    });

    it('leaves the version draft and tells nobody when the request cannot become quoted on a director submission', async () => {
      const { id, requestId } = await quote();
      await db.dataSource.query(
        `UPDATE sales_requests SET status = 'cancelled' WHERE id = $1`,
        [requestId],
      );

      await expect(db.approvals.submit(id, db.director)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(await statusOf(id)).toEqual(['draft']);
      expect(db.notifications.emit).not.toHaveBeenCalled();
    });

    it('answers 403 to the owner who did not create the version, and 404 to another sales', async () => {
      const { id } = await quote(db.manager);

      await expect(db.approvals.submit(id, db.salesA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(db.approvals.submit(id, db.salesB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(await statusOf(id)).toEqual(['draft']);
      expect(db.notifications.emit).not.toHaveBeenCalled();
    });

    it('answers 409 to a version that is not a draft', async () => {
      const { id } = await submitted();

      await expect(db.approvals.submit(id, db.salesA)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.notifications.emit).not.toHaveBeenCalled();
    });

    it('notifies nobody and changes nothing when the transaction rolls back', async () => {
      const { id } = await quote();
      jest
        .spyOn(requestActivity, 'recordRequestActivity')
        .mockRejectedValueOnce(new Error('timeline write failed'));

      await expect(db.approvals.submit(id, db.salesA)).rejects.toThrow(
        'timeline write failed',
      );

      expect(await statusOf(id)).toEqual(['draft']);
      expect(db.notifications.emit).not.toHaveBeenCalled();
    });

    it('does not undo a committed submission when the notice cannot be sent', async () => {
      const { id } = await quote();
      db.notifications.emit.mockRejectedValueOnce(new Error('queue down'));

      const detail = await db.approvals.submit(id, db.salesA);

      expect(detail.current.status).toBe('pending_approval');
    });
  });

  describe('stale estimate', () => {
    /**
     * Revises and resubmits the estimate with one more panel, so the draft is behind. The sales
     * manager then prices the new panel at 2,000 and marks the revision priced, unless `priced`
     * is false, which leaves the new revision submitted but unpriced.
     */
    const reviseEstimate = async (estimateId: number, priced = true) => {
      await db.estimateService.revise(estimateId, db.engineer);
      const view = await db.editor.addPanel(
        estimateId,
        { tag: 'NEW-01', quantity: 3 },
        db.engineer,
      );
      const withLine = await db.editor.addBomLine(
        estimateId,
        view.panels[view.panels.length - 1].id,
        { itemId: db.itemId, quantity: 1 },
        db.engineer,
      );
      await db.estimateService.submit(estimateId, db.engineer);
      if (priced) {
        const panel = withLine.panels[withLine.panels.length - 1];
        await db.pricing.setUnitCost(
          estimateId,
          panel.bomLines[0].id,
          { unitCost: 2000 },
          db.manager,
        );
        await db.pricing.complete(estimateId, db.manager);
      }
      db.notifications.emit.mockClear();
    };

    it('refuses to submit a draft built on a superseded revision, then passes after a refresh that keeps the margins', async () => {
      const made = await quote(db.salesA, [
        { tag: 'MSB-01', quantity: 2, unitCost: 1000 },
        { tag: 'DB-02', quantity: 1, unitCost: 500 },
      ]);
      const [first, second] = made.quotation.current.lines;
      await db.versions.updatePricing(
        made.id,
        {
          lines: [
            { lineId: first.id, marginPercent: 10 },
            { lineId: second.id, marginPercent: 20 },
          ],
        },
        db.salesA,
      );
      await reviseEstimate(made.estimateId);

      const stale = await db.quotations.findOne(made.id, db.salesA);
      expect(stale.estimateStale).toBe(true);
      await expect(
        db.approvals.submit(made.id, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.notifications.emit).not.toHaveBeenCalled();

      const refreshed = await db.versions.refreshEstimate(made.id, db.salesA);

      expect(refreshed.estimateStale).toBe(false);
      expect(refreshed.current.estimateRevision).toBe(2);
      expect(
        refreshed.current.lines.map((line) => [line.tag, line.marginPercent]),
      ).toEqual([
        ['MSB-01', 10],
        ['DB-02', 20],
        ['NEW-01', 0],
      ]);
      expect(
        refreshed.current.lines.find((line) => line.tag === 'NEW-01')?.bomLines,
      ).toHaveLength(1);
      // Totals follow the rebuilt lines: 1100×2 + 600×1 + 2000×3.
      expect(refreshed.current.subtotal).toBe(8800);

      const detail = await db.approvals.submit(made.id, db.salesA);
      expect(detail.current.status).toBe('pending_approval');
    });

    it('refuses to refresh or submit a draft while the new revision is unpriced, until it is priced', async () => {
      const made = await quote();
      await reviseEstimate(made.estimateId, false);

      expect(
        (await db.quotations.findOne(made.id, db.salesA)).estimateStale,
      ).toBe(true);
      await expect(
        db.approvals.submit(made.id, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        db.versions.refreshEstimate(made.id, db.salesA),
      ).rejects.toThrow('The request has no priced estimate to quote.');
      expect(db.notifications.emit).not.toHaveBeenCalled();

      const unpriced = await db.estimateService.findOne(
        made.estimateId,
        db.manager,
      );
      await db.pricing.setUnitCost(
        made.estimateId,
        unpriced.current.panels[1].bomLines[0].id,
        { unitCost: 2000 },
        db.manager,
      );
      await db.pricing.complete(made.estimateId, db.manager);

      const refreshed = await db.versions.refreshEstimate(made.id, db.salesA);
      expect(refreshed.current.estimateRevision).toBe(2);
      const detail = await db.approvals.submit(made.id, db.salesA);
      expect(detail.current.status).toBe('pending_approval');
    });

    it('leaves a draft that is already on the latest revision as it is', async () => {
      const made = await quote();

      const same = await db.versions.refreshEstimate(made.id, db.salesA);

      expect(same.current.lines.map((line) => line.id)).toEqual(
        made.quotation.current.lines.map((line) => line.id),
      );
    });

    it('refreshes only a draft', async () => {
      const made = await submitted();

      await expect(
        db.versions.refreshEstimate(made.id, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('approve', () => {
    it('answers 409 to a draft', async () => {
      const { id } = await quote();

      await expect(db.approvals.approve(id, db.manager)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(await statusOf(id)).toEqual(['draft']);
    });

    it('answers 403 when the approver created the version', async () => {
      const made = await quote(db.manager);
      await db.approvals.submit(made.id, db.manager);

      await expect(
        db.approvals.approve(made.id, db.manager),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(await statusOf(made.id)).toEqual(['pending_approval']);
      expect((await requestRow(made.requestId)).status).toBe('estimated');
    });

    it('approves in one step, moves the request to quoted and tells the sales owner once', async () => {
      const made = await submitted();

      const detail = await db.approvals.approve(made.id, db.manager);

      expect(detail.current.status).toBe('approved');
      expect(detail.request.status).toBe('quoted');
      const [row] = await versionRows(made.id);
      expect(row.decided_by).toBe(db.manager.userId);
      expect(db.notifications.emit).toHaveBeenCalledTimes(2);
      expect(db.notifications.emit).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          eventType: 'sales.quotation.approved',
          userIds: [db.salesA.userId],
          requiredScope: 'quotation:read',
        }),
      );
      expect(db.notifications.emit).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          eventType: 'sales.quotation.approved',
          roleCodes: ['salesManager'],
          requiredScope: 'quotation:read',
          excludeUserIds: [db.manager.userId, db.salesA.userId],
        }),
      );
    });

    it('rolls the approval back, and notifies nobody, when the request cannot become quoted', async () => {
      const made = await submitted();
      await db.dataSource.query(
        `UPDATE sales_requests SET status = 'cancelled' WHERE id = $1`,
        [made.requestId],
      );

      await expect(
        db.approvals.approve(made.id, db.manager),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await statusOf(made.id)).toEqual(['pending_approval']);
      expect(db.notifications.emit).not.toHaveBeenCalled();
    });

    it('lets exactly one of two concurrent approvals through', async () => {
      const made = await submitted();

      const results = await Promise.allSettled([
        db.approvals.approve(made.id, db.manager),
        db.approvals.approve(made.id, db.manager),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected');
      expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      );
      // One approval, announced to the owner and to the sales managers.
      expect(db.notifications.emit).toHaveBeenCalledTimes(2);
    });

    it('answers 403 to the approver who last edited the price, and lets another approver through', async () => {
      const made = await quote();
      await db.versions.updatePricing(
        made.id,
        { vatRate: 10, terms: ['Edited by the manager'] },
        db.manager,
      );
      await db.approvals.submit(made.id, db.manager);

      await expect(
        db.approvals.approve(made.id, db.manager),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        db.approvals.reject(made.id, { reason: 'No' }, db.manager),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await statusOf(made.id)).toEqual(['pending_approval']);

      const detail = await db.approvals.approve(made.id, db.director);
      expect(detail.current.status).toBe('approved');
      expect(detail.current.lastEditedBy).toBe(db.manager.userId);
    });

    it('keeps four-eyes for an admin: 403 to approve and reject a version they created or last edited', async () => {
      // The director's user row acting with the admin role: four-eyes reads the role and the id only.
      const admin: AuthUserPayload = {
        userId: db.director.userId,
        role: 'admin',
      };
      const edited = await quote();
      await db.versions.updatePricing(
        edited.id,
        { vatRate: 10, terms: ['Edited by the admin'] },
        admin,
      );
      await db.approvals.submit(edited.id, db.salesA);
      const created = await quote(admin);
      await db.approvals.submit(created.id, admin);

      for (const { id } of [edited, created]) {
        await expect(db.approvals.approve(id, admin)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        await expect(
          db.approvals.reject(id, { reason: 'No' }, admin),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await statusOf(id)).toEqual(['pending_approval']);
      }
    });

    it('lets the director approve a version they last edited', async () => {
      const made = await quote();
      await db.versions.updatePricing(
        made.id,
        { vatRate: 10, terms: ['Edited by the director'] },
        db.director,
      );
      await db.approvals.submit(made.id, db.salesA);

      const detail = await db.approvals.approve(made.id, db.director);

      expect(detail.current.status).toBe('approved');
      expect(detail.current.lastEditedBy).toBe(db.director.userId);
    });

    it('counts a refresh from the estimate as an edit', async () => {
      const made = await quote();
      await db.estimateService.revise(made.estimateId, db.engineer);
      await db.estimateService.submit(made.estimateId, db.engineer);
      await db.pricing.complete(made.estimateId, db.manager);
      await db.versions.refreshEstimate(made.id, db.manager);
      await db.approvals.submit(made.id, db.salesA);

      await expect(
        db.approvals.approve(made.id, db.manager),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('starts a revision with no editor, so the earlier editor may approve it', async () => {
      const made = await quote();
      await db.versions.updatePricing(made.id, { vatRate: 10 }, db.manager);
      await db.approvals.submit(made.id, db.salesA);
      await db.approvals.reject(made.id, { reason: 'No' }, db.director);

      const revised = await db.versions.revise(made.id, db.salesA);
      expect(revised.current.lastEditedBy).toBeNull();
      await db.approvals.submit(made.id, db.salesA);

      const detail = await db.approvals.approve(made.id, db.manager);
      expect(detail.current.status).toBe('approved');
    });

    it('answers 404 to a sales outside the data scope', async () => {
      const { id } = await submitted();

      await expect(db.approvals.approve(id, db.salesB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reject', () => {
    it('rejects with the reason, tells the sales owner, and lets Sales revise it', async () => {
      const made = await submitted();

      const detail = await db.approvals.reject(
        made.id,
        { reason: 'Margin too thin' },
        db.manager,
      );

      expect(detail.current.status).toBe('rejected');
      expect(detail.current.decisionReason).toBe('Margin too thin');
      expect(db.notifications.emit).toHaveBeenCalledTimes(1);
      expect(db.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'sales.quotation.rejected',
          userIds: [db.salesA.userId],
        }),
      );
      expect((await requestRow(made.requestId)).status).toBe('estimated');

      const revised = await db.versions.revise(made.id, db.salesA);
      expect(revised.current.ver).toBe(2);
      expect(revised.current.status).toBe('draft');
      expect(await statusOf(made.id)).toEqual(['closed', 'draft']);
    });

    it('answers 400 to a blank reason, 403 to the creator and 409 to a draft', async () => {
      const made = await submitted(db.manager);

      await expect(
        db.approvals.reject(made.id, { reason: '  ' }, db.manager),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        db.approvals.reject(made.id, { reason: 'No' }, db.manager),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const draft = await quote();
      await expect(
        db.approvals.reject(draft.id, { reason: 'No' }, db.manager),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('confirm', () => {
    it('answers 409 to a version still pending approval', async () => {
      const { id } = await submitted();

      await expect(db.approvals.confirm(id, db.salesA)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(await statusOf(id)).toEqual(['pending_approval']);
    });

    it('confirms an approved version and keeps the request quoted', async () => {
      const made = await approved();

      const detail = await db.approvals.confirm(made.id, db.salesA);

      expect(detail.current.status).toBe('customer_confirmed');
      expect((await requestRow(made.requestId)).status).toBe('quoted');
      await expect(
        db.versions.revise(made.id, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancel', () => {
    it.each([
      ['draft', async () => quote()],
      ['pending_approval', async () => submitted()],
      ['approved', async () => approved()],
    ])(
      'cancels a %s version and loses the request with the reason',
      async (_status, build) => {
        const made = await build();

        const detail = await db.approvals.cancel(
          made.id,
          { reason: 'Customer chose a rival' },
          db.salesA,
        );

        expect(detail.current.status).toBe('cancelled');
        expect(detail.current.decisionReason).toBe('Customer chose a rival');
        expect(await requestRow(made.requestId)).toMatchObject({
          status: 'lost',
          lost_reason: 'Customer chose a rival',
        });
      },
    );

    it('cancels a rejected version', async () => {
      const made = await submitted();
      await db.approvals.reject(made.id, { reason: 'No' }, db.manager);

      await db.approvals.cancel(made.id, { reason: 'Dropped' }, db.salesA);

      expect(await statusOf(made.id)).toEqual(['cancelled']);
      expect((await requestRow(made.requestId)).status).toBe('lost');
    });

    it('answers 409 to a confirmed or an already cancelled quotation, and 400 to a blank reason', async () => {
      const confirmed = await approved();
      await db.approvals.confirm(confirmed.id, db.salesA);
      await expect(
        db.approvals.cancel(confirmed.id, { reason: 'Late' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await statusOf(confirmed.id)).toEqual(['customer_confirmed']);

      const made = await quote();
      await expect(
        db.approvals.cancel(made.id, { reason: ' ' }, db.salesA),
      ).rejects.toBeInstanceOf(BadRequestException);
      await db.approvals.cancel(made.id, { reason: 'Dropped' }, db.salesA);
      await expect(
        db.approvals.cancel(made.id, { reason: 'Again' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        db.versions.revise(made.id, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('leaves the version and the request untouched when the request cannot be lost', async () => {
      const made = await quote();
      await db.dataSource.query(
        `UPDATE sales_requests SET status = 'won' WHERE id = $1`,
        [made.requestId],
      );

      await expect(
        db.approvals.cancel(made.id, { reason: 'Dropped' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await statusOf(made.id)).toEqual(['draft']);
      expect((await requestRow(made.requestId)).status).toBe('won');
    });
  });

  describe('revise and confirm racing on one approved version', () => {
    it('lets exactly one win, and never leaves a version both closed and confirmed', async () => {
      for (let round = 0; round < 3; round += 1) {
        const made = await approved();

        const results = await Promise.allSettled([
          db.versions.revise(made.id, db.salesA),
          db.approvals.confirm(made.id, db.salesA),
        ]);

        const winners = results.filter((r) => r.status === 'fulfilled');
        expect(winners).toHaveLength(1);
        const loser = results.find((r) => r.status === 'rejected');
        expect((loser as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictException,
        );

        const statuses = await statusOf(made.id);
        expect([['closed', 'draft'], ['customer_confirmed']]).toContainEqual(
          statuses,
        );
      }
    });
  });

  describe('closing the request from its own page', () => {
    it.each([
      ['draft', async () => quote()],
      ['pending_approval', async () => submitted()],
    ])(
      'cancelling the request cancels its %s quotation in the same transaction, with the same reason',
      async (_status, build) => {
        const made = await build();

        await db.requests.cancel(
          made.requestId,
          { reason: 'Project shelved' },
          db.salesA,
        );

        const [row] = await versionRows(made.id);
        expect(row).toMatchObject({
          status: 'cancelled',
          decision_reason: 'Project shelved',
          decided_by: db.salesA.userId,
        });
        expect(await requestRow(made.requestId)).toMatchObject({
          status: 'cancelled',
          cancel_reason: 'Project shelved',
        });
      },
    );

    it('marking the request lost cancels an approved quotation with it', async () => {
      const made = await approved();

      await db.requests.markLost(
        made.requestId,
        { reason: 'Went to a rival' },
        db.salesA,
      );

      expect(await statusOf(made.id)).toEqual(['cancelled']);
      expect(await requestRow(made.requestId)).toMatchObject({
        status: 'lost',
        lost_reason: 'Went to a rival',
      });
    });

    it('rolls the quotation back with the request when the close fails after the hook ran', async () => {
      const made = await approved();

      // A quoted request cannot be cancelled: the move fails after the hook cancelled the version.
      await expect(
        db.requests.cancel(made.requestId, { reason: 'Nope' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await statusOf(made.id)).toEqual(['approved']);
      expect((await requestRow(made.requestId)).status).toBe('quoted');
    });

    it('answers 409 and keeps the request open when the quotation is confirmed', async () => {
      const made = await approved();
      await db.approvals.confirm(made.id, db.salesA);

      await expect(
        db.requests.markLost(made.requestId, { reason: 'Nope' }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await statusOf(made.id)).toEqual(['customer_confirmed']);
      expect((await requestRow(made.requestId)).status).toBe('quoted');
    });

    it('settles a close of the request racing a confirmation, round after round, without a deadlock', async () => {
      for (let round = 0; round < 4; round += 1) {
        const made = await approved();

        const results = await Promise.allSettled([
          db.approvals.confirm(made.id, db.salesA),
          db.requests.markLost(made.requestId, { reason: 'Race' }, db.salesA),
        ]);

        const failures = results.filter((r) => r.status === 'rejected');
        expect(failures).toHaveLength(1);
        expect(failures[0].reason).toBeInstanceOf(ConflictException);
        const [version] = await statusOf(made.id);
        const request = (await requestRow(made.requestId)).status;
        expect([
          ['customer_confirmed', 'quoted'],
          ['cancelled', 'lost'],
        ]).toContainEqual([version, request]);
      }
    });

    it('settles a cancel of the request racing an approval without a deadlock', async () => {
      const made = await submitted();

      const results = await Promise.allSettled([
        db.approvals.approve(made.id, db.manager),
        db.requests.cancel(made.requestId, { reason: 'Race' }, db.salesA),
      ]);

      const failures = results.filter((r) => r.status === 'rejected');
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBeInstanceOf(ConflictException);
      const [version] = await statusOf(made.id);
      const request = (await requestRow(made.requestId)).status;
      expect([
        ['approved', 'quoted'],
        ['cancelled', 'cancelled'],
      ]).toContainEqual([version, request]);
    });
  });
});
