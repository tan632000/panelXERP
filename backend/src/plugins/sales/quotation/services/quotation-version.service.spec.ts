import { ConflictException, NotFoundException } from '@nestjs/common';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import {
  describeWithDatabase,
  openQuotationDb,
  type PanelSpec,
  type QuotationDb,
} from '@plugins/sales/quotation/quotation-db.helper-spec';

import type { QuotationFilterDto } from '@plugins/sales/quotation/dto/quotation-filter.dto';
import type { QuotationDetail } from '@plugins/sales/quotation/services/quotation.service';
import type { QuotationBomLineView } from '@plugins/sales/quotation/utils/quotation-version.util';

/**
 * Quotation versions against the real Postgres of the compose stack: the worked example end to
 * end, create rules, the draft-only edit, revise from each status, the revise race (the header
 * row lock plus the one-open-version and unique-number indexes decide the winner), data scope
 * and the frozen BOM copy. Estimates are built through the real estimate services.
 */
describeWithDatabase('Quotation versions against Postgres', () => {
  let db: QuotationDb;

  /** Worked example (D-10): two panels, so qty 2 at 1,234,567 and qty 1 at 500,000. */
  const WORKED_PANELS: PanelSpec[] = [
    { tag: 'MSB-01', quantity: 2, unitCost: 1_234_567 },
    { tag: 'DB-02', quantity: 1, unitCost: 500_000 },
  ];

  beforeAll(async () => {
    db = await openQuotationDb([Customer, Project, Contact, Item]);
  });
  afterEach(async () => {
    await db.cleanup();
  });
  afterAll(async () => {
    await db?.close();
  });

  const create = async (panels?: PanelSpec[]) => {
    const estimated = await db.estimatedRequest(panels);
    const quotation = await db.quotations.create(
      { requestId: estimated.requestId },
      db.salesA,
    );
    return { ...estimated, quotation };
  };

  const setVersionStatus = (quotationId: number, ver: number, status: string) =>
    db.dataSource.query(
      `UPDATE sales_quotation_versions SET status = $3 WHERE quotation_id = $1 AND ver = $2`,
      [quotationId, ver, status],
    );
  const versionRows = (quotationId: number) =>
    db.dataSource.query<Array<{ ver: number; status: string }>>(
      `SELECT ver, status FROM sales_quotation_versions WHERE quotation_id = $1 ORDER BY ver`,
      [quotationId],
    );
  const requestStatus = async (id: number) =>
    (
      await db.dataSource.query<Array<{ status: string }>>(
        `SELECT status FROM sales_requests WHERE id = $1`,
        [id],
      )
    )[0].status;
  /** A BOM copy line without its row id, which differs between versions. */
  const named = ({
    itemCode,
    itemName,
    itemBrand,
    itemUnit,
    quantity,
  }: QuotationBomLineView) => ({
    itemCode,
    itemName,
    itemBrand,
    itemUnit,
    quantity,
  });
  /** The item each BOM copy line of a version points at, in line order. */
  const bomItemIds = async (quotationId: number, ver: number) =>
    (
      await db.dataSource.query<Array<{ item_id: number | null }>>(
        `SELECT b.item_id FROM sales_quotation_bom_lines b
           JOIN sales_quotation_lines l ON l.id = b.line_id
           JOIN sales_quotation_versions v ON v.id = l.version_id
          WHERE v.quotation_id = $1 AND v.ver = $2
          ORDER BY l.id, b.id`,
        [quotationId, ver],
      )
    ).map((row) => row.item_id);
  const marginsOf = (detail: QuotationDetail, margins: number[]) =>
    detail.current.lines.map((line, index) => ({
      lineId: line.id,
      marginPercent: margins[index],
    }));

  describe('create', () => {
    it('builds version 1 as a draft from the latest submitted estimate, at margin 0', async () => {
      const { quotation, requestId, revisionId } = await create(WORKED_PANELS);

      expect(quotation.code).toMatch(/^\d{2,}-\d{8}\/BG$/);
      expect(quotation.latestVer).toBe(1);
      expect(quotation.current).toMatchObject({
        ver: 1,
        status: 'draft',
        estimateRevisionId: revisionId,
        discountType: 'percent',
        discountValue: 0,
        vatRate: 8,
      });
      expect(
        quotation.current.lines.map((line) => ({
          tag: line.tag,
          quantity: line.quantity,
          unitCost: line.unitCost,
          marginPercent: line.marginPercent,
          unitPrice: line.unitPrice,
        })),
      ).toEqual([
        {
          tag: 'MSB-01',
          quantity: 2,
          unitCost: 1_234_567,
          marginPercent: 0,
          unitPrice: 1_234_567,
        },
        {
          tag: 'DB-02',
          quantity: 1,
          unitCost: 500_000,
          marginPercent: 0,
          unitPrice: 500_000,
        },
      ]);
      // 2 × 1,234,567 + 500,000 = 2,969,134; VAT 8% = 237,530.72 → 237,531.
      expect(quotation.current).toMatchObject({
        subtotal: 2_969_134,
        discountAmount: 0,
        vatAmount: 237_531,
        total: 3_206_665,
      });
      // Approval, not creation, moves the request on.
      expect(await requestStatus(requestId)).toBe('estimated');
    });

    it('dates the code at the Vietnam day it was created', async () => {
      const { quotation } = await create();

      const today = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
        .format(new Date())
        .replace(/\//g, '');
      expect(quotation.code.split('/')[0].split('-')[1]).toBe(today);
    });

    it('copies each panel’s BOM and cost-line names for the customer-facing output', async () => {
      const { quotation } = await create();

      expect(quotation.current.lines[0].bomLines).toEqual([
        expect.objectContaining({
          itemCode: expect.stringMatching(/^QT-/) as string,
          itemName: 'QT spec item',
          itemUnit: 'Cái',
          quantity: 1,
        }),
      ]);
    });

    it('answers 409 when the revision is not the latest submitted one', async () => {
      const { requestId, estimateId, revisionId } = await db.estimatedRequest();
      await db.estimateService.revise(estimateId, db.engineer);
      await db.editor.addPanel(
        estimateId,
        { tag: 'EXTRA', quantity: 1 },
        db.engineer,
      );
      const detail = await db.estimateService.findOne(estimateId, db.engineer);
      await db.editor.addBomLine(
        estimateId,
        detail.current.panels[detail.current.panels.length - 1].id,
        { itemId: db.itemId, quantity: 1 },
        db.engineer,
      );
      await db.estimateService.submit(estimateId, db.engineer);
      await db.pricing.complete(estimateId, db.manager);

      await expect(
        db.quotations.create(
          { requestId, estimateRevisionId: revisionId },
          db.salesA,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await requestStatus(requestId)).toBe('estimated');

      const latest = await db.estimateService.findOne(estimateId, db.engineer);
      const created = await db.quotations.create(
        { requestId, estimateRevisionId: latest.current.id },
        db.salesA,
      );
      expect(created.current.estimateRevision).toBe(2);
      expect(created.current.lines).toHaveLength(2);
    });

    it('answers 409 until the submitted estimate is priced, then builds the quotation', async () => {
      const { requestId, estimateId } = await db.estimatedRequest(undefined, {
        priced: false,
      });

      await expect(
        db.quotations.create({ requestId }, db.salesA),
      ).rejects.toThrow('The request has no priced estimate to quote.');
      expect(await requestStatus(requestId)).toBe('estimated');

      await db.pricing.complete(estimateId, db.manager);
      const created = await db.quotations.create({ requestId }, db.salesA);
      expect(created.current.estimateRevision).toBe(1);
    });

    it('answers 409 for a request with no estimate, and for a second quotation', async () => {
      const unestimated = await db.requestAt('assigned');
      await expect(
        db.quotations.create({ requestId: unestimated }, db.salesA),
      ).rejects.toThrow('The request has no priced estimate to quote.');

      const { requestId } = await create();
      await expect(
        db.quotations.create({ requestId }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 409 when the request is not estimated', async () => {
      const { requestId } = await db.estimatedRequest();
      await db.dataSource.query(
        `UPDATE sales_requests SET status = 'lost' WHERE id = $1`,
        [requestId],
      );

      await expect(
        db.quotations.create({ requestId }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 409 for a second quotation even when the first one was cancelled', async () => {
      const first = await create();
      await setVersionStatus(first.quotation.id, 1, 'cancelled');

      await expect(
        db.quotations.create({ requestId: first.requestId }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets the engineer revise and resubmit the estimate while a quotation draft exists', async () => {
      const { quotation, requestId, estimateId, revisionId } = await create();
      const frozen = quotation.current.lines.map((line) => line.bomLines);

      await db.estimateService.revise(estimateId, db.engineer);
      const detail = await db.estimateService.findOne(estimateId, db.engineer);
      await db.editor.updateBomLine(
        estimateId,
        detail.current.panels[0].bomLines[0].id,
        { quantity: 9 },
        db.engineer,
      );
      const resubmitted = await db.estimateService.submit(
        estimateId,
        db.engineer,
      );

      expect(resubmitted.current.revision).toBe(2);
      expect(await requestStatus(requestId)).toBe('estimated');
      const after = await db.quotations.findOne(quotation.id, db.salesA);
      expect(after.current).toMatchObject({
        status: 'draft',
        estimateRevisionId: revisionId,
        estimateRevision: 1,
      });
      expect(after.current.lines.map((line) => line.bomLines)).toEqual(frozen);
    });

    it('answers 404 to a Sales actor who does not own the request, without revealing its estimate', async () => {
      const { requestId } = await db.estimatedRequest();

      await expect(
        db.quotations.create({ requestId }, db.salesB),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await requestStatus(requestId)).toBe('estimated');
    });

    it('lets exactly one of two concurrent creates for one request through', async () => {
      const { requestId } = await db.estimatedRequest();

      const results = await Promise.allSettled([
        db.quotations.create({ requestId }, db.salesA),
        db.quotations.create({ requestId }, db.manager),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    });

    it('gives concurrent creates for different requests distinct codes', async () => {
      const [a, b, c] = await Promise.all([
        db.estimatedRequest(),
        db.estimatedRequest(),
        db.estimatedRequest(),
      ]);

      const created = await Promise.all(
        [a, b, c].map((entry) =>
          db.quotations.create({ requestId: entry.requestId }, db.salesA),
        ),
      );

      expect(new Set(created.map((entry) => entry.code)).size).toBe(3);
    });
  });

  describe('list', () => {
    it('lists a quotation with its request and latest version, inside the actor scope', async () => {
      const { quotation, requestId } = await create(WORKED_PANELS);
      const query = { requestId } as QuotationFilterDto;

      const own = await db.quotations.findAll(query, db.salesA);
      const other = await db.quotations.findAll(query, db.salesB);
      const manager = await db.quotations.findAll(query, db.manager);

      expect(own.meta.total).toBe(1);
      expect(own.data[0]).toMatchObject({
        id: quotation.id,
        code: quotation.code,
        latestVer: 1,
        request: {
          id: requestId,
          title: 'QT spec request',
          customerId: db.customerId,
        },
        latest: { ver: 1, status: 'draft', total: 3_206_665 },
      });
      expect(other.meta.total).toBe(0);
      expect(other.data).toEqual([]);
      expect(manager.meta.total).toBe(1);
    });

    it('filters by the latest version status, code, customer and keyword', async () => {
      const { quotation, requestId } = await create();
      const ofRequest = (extra: Partial<QuotationFilterDto>) =>
        db.quotations
          .findAll({ requestId, ...extra }, db.salesA)
          .then((page) => page.meta.total);

      expect(await ofRequest({ status: 'draft' as never })).toBe(1);
      expect(await ofRequest({ status: 'approved' as never })).toBe(0);
      expect(await ofRequest({ code: quotation.code.split('/')[0] })).toBe(1);
      expect(await ofRequest({ code: 'ZZ-no-such' })).toBe(0);
      expect(await ofRequest({ customerId: db.customerId })).toBe(1);
      expect(await ofRequest({ customerId: db.customerId + 100_000 })).toBe(0);
      expect(await ofRequest({ search: quotation.code })).toBe(1);
      expect(await ofRequest({ search: 'QT spec request' })).toBe(1);
      expect(await ofRequest({ search: 'nothing like this' })).toBe(0);
    });

    it('pages the list newest first', async () => {
      const first = await create();
      const second = await create();

      const page = await db.quotations.findAll(
        { customerId: db.customerId, limit: 1, page: 1 },
        db.salesA,
      );

      expect(page.meta.total).toBeGreaterThanOrEqual(2);
      expect(page.data).toHaveLength(1);
      expect(page.data[0].id).toBe(second.quotation.id);
      expect(page.data[0].id).not.toBe(first.quotation.id);
    });
  });

  describe('pricing', () => {
    it('reproduces the worked example from margins, discount and VAT: 3,363,511', async () => {
      const { quotation } = await create(WORKED_PANELS);

      const priced = await db.versions.updatePricing(
        quotation.id,
        {
          lines: marginsOf(quotation, [12.5, 0.1]),
          discountType: 'percent' as never,
          discountValue: 5,
          vatRate: 8,
        },
        db.salesA,
      );

      expect(priced.current.lines.map((line) => line.unitPrice)).toEqual([
        1_388_888, 500_500,
      ]);
      expect(priced.current).toMatchObject({
        subtotal: 3_278_276,
        discountAmount: 163_914,
        taxable: 3_114_362,
        vatAmount: 249_149,
        total: 3_363_511,
      });
      expect(priced.versions).toEqual([
        expect.objectContaining({ ver: 1, total: 3_363_511 }),
      ]);
    });

    it('stores what the server computed, not what a client could display', async () => {
      const { quotation } = await create(WORKED_PANELS);
      await db.versions.updatePricing(
        quotation.id,
        { lines: marginsOf(quotation, [12.5, 0.1]), vatRate: 10 },
        db.salesA,
      );

      const [row] = await db.dataSource.query<Array<{ total: string }>>(
        `SELECT total FROM sales_quotation_versions WHERE quotation_id = $1`,
        [quotation.id],
      );
      // 2,777,776 + 500,500 = 3,278,276; VAT 10% = 327,827.6 → 327,828.
      expect(Number(row.total)).toBe(3_606_104);
    });

    it('refuses a discount above the subtotal with a 400 and changes nothing', async () => {
      const { quotation } = await create(WORKED_PANELS);

      await expect(
        db.versions.updatePricing(
          quotation.id,
          { discountType: 'amount' as never, discountValue: 99_999_999 },
          db.salesA,
        ),
      ).rejects.toMatchObject({ status: 400 });

      const after = await db.quotations.findOne(quotation.id, db.salesA);
      expect(after.current.discountValue).toBe(0);
    });

    it('refuses a line of another version with a 400', async () => {
      const { quotation } = await create();
      const other = await create();

      await expect(
        db.versions.updatePricing(
          quotation.id,
          {
            lines: [
              { lineId: other.quotation.current.lines[0].id, marginPercent: 5 },
            ],
          },
          db.salesA,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('answers 409 when editing a pending_approval version', async () => {
      const { quotation } = await create();
      await setVersionStatus(quotation.id, 1, 'pending_approval');

      await expect(
        db.versions.updatePricing(quotation.id, { vatRate: 10 }, db.salesA),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 404 to a Sales actor who does not own the request', async () => {
      const { quotation } = await create();

      await expect(
        db.quotations.findOne(quotation.id, db.salesB),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        db.versions.updatePricing(quotation.id, { vatRate: 10 }, db.salesB),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        db.versions.revise(quotation.id, db.salesB),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        db.quotations.findOne(quotation.id, db.manager),
      ).resolves.toMatchObject({ id: quotation.id });
    });
  });

  describe('revise', () => {
    it.each(['pending_approval', 'approved', 'rejected'])(
      'opens version 2 as a draft from %s, copying lines and pricing, and closes version 1',
      async (status) => {
        const { quotation, requestId } = await create(WORKED_PANELS);
        await db.versions.updatePricing(
          quotation.id,
          {
            lines: marginsOf(quotation, [12.5, 0.1]),
            discountValue: 5,
          },
          db.salesA,
        );
        await setVersionStatus(quotation.id, 1, status);

        const revised = await db.versions.revise(quotation.id, db.salesA);

        expect(revised.latestVer).toBe(2);
        expect(revised.current).toMatchObject({
          ver: 2,
          status: 'draft',
          discountValue: 5,
          vatRate: 8,
          total: 3_363_511,
        });
        expect(revised.current.lines.map((line) => line.marginPercent)).toEqual(
          [12.5, 0.1],
        );
        expect(await versionRows(quotation.id)).toEqual([
          { ver: 1, status: 'closed' },
          { ver: 2, status: 'draft' },
        ]);
        const history = await db.quotations.findOne(quotation.id, db.salesA, 1);
        expect(history.current.status).toBe('closed');
        const activity = await db.dataSource.query<Array<{ action: string }>>(
          `SELECT action FROM sales_request_activities WHERE request_id = $1 AND action = 'quotation_revised'`,
          [requestId],
        );
        expect(activity).toHaveLength(1);
      },
    );

    it.each(['draft', 'customer_confirmed', 'cancelled', 'closed'])(
      'answers 409 from %s and leaves the versions alone',
      async (status) => {
        const { quotation } = await create();
        await setVersionStatus(quotation.id, 1, status);

        await expect(
          db.versions.revise(quotation.id, db.salesA),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await versionRows(quotation.id)).toEqual([{ ver: 1, status }]);
      },
    );

    it('lets exactly one of two concurrent revises through, with unique version numbers', async () => {
      const { quotation } = await create();
      await setVersionStatus(quotation.id, 1, 'approved');

      const results = await Promise.allSettled([
        db.versions.revise(quotation.id, db.salesA),
        db.versions.revise(quotation.id, db.manager),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      expect(await versionRows(quotation.id)).toEqual([
        { ver: 1, status: 'closed' },
        { ver: 2, status: 'draft' },
      ]);
    });

    it('links every BOM copy to the estimate line’s item, through a revise, after the item is renamed and deleted', async () => {
      const estimated = await db.estimatedRequest(WORKED_PANELS);
      // The catalog moves on after the estimate froze the code: renamed, then deleted.
      await db.dataSource.query(
        `UPDATE items SET code = code || '-OLD', is_deleted = true WHERE id = $1`,
        [db.itemId],
      );
      try {
        const quotation = await db.quotations.create(
          { requestId: estimated.requestId },
          db.salesA,
        );
        expect(await bomItemIds(quotation.id, 1)).toEqual([
          db.itemId,
          db.itemId,
        ]);

        await setVersionStatus(quotation.id, 1, 'approved');
        await db.versions.revise(quotation.id, db.salesA);
        expect(await bomItemIds(quotation.id, 2)).toEqual([
          db.itemId,
          db.itemId,
        ]);
      } finally {
        await db.dataSource.query(
          `UPDATE items SET code = regexp_replace(code, '-OLD$', ''), is_deleted = false
            WHERE id = $1`,
          [db.itemId],
        );
      }
    });

    it('keeps the BOM copy as it was when the estimate changes later, and carries it to the revision', async () => {
      const { quotation, estimateId } = await create();
      const frozen = quotation.current.lines.map((line) => line.bomLines);

      await db.estimateService.revise(estimateId, db.engineer);
      const detail = await db.estimateService.findOne(estimateId, db.engineer);
      const bom = detail.current.panels[0].bomLines[0];
      await db.editor.updateBomLine(
        estimateId,
        bom.id,
        { quantity: 9 },
        db.engineer,
      );
      await db.dataSource.query(
        `UPDATE items SET name = 'Renamed item' WHERE id = $1`,
        [db.itemId],
      );
      await db.estimateService.submit(estimateId, db.engineer);

      const after = await db.quotations.findOne(quotation.id, db.salesA);
      expect(after.current.lines.map((line) => line.bomLines)).toEqual(frozen);

      await setVersionStatus(quotation.id, 1, 'approved');
      const revised = await db.versions.revise(quotation.id, db.salesA);
      expect(
        revised.current.lines.map((line) => line.bomLines.map(named)),
      ).toEqual(frozen.map((lines) => lines.map(named)));
    });
  });
});
