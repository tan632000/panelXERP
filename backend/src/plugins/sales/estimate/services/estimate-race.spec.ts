import { randomBytes } from 'crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import { DataScopeService } from '@shared/services/data-scope.service';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { ItemService } from '@plugins/catalog/item/services/item.service';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimatePricingService } from '@plugins/sales/estimate/services/estimate-pricing.service';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * The estimate against the real Postgres of the compose stack: concurrent submits and revises
 * of one estimate (the estimate row lock plus the one-draft and one-submitted indexes decide
 * the winner), concurrent creates (distinct codes), the item delete check's SQL and the
 * request-code search.
 *
 * An unreachable database fails the suite; `SKIP_DB_SPECS=1` is the one explicit opt-out, and
 * then jest reports these as skipped. Needs the seeded `sales_a`, `engineer_a` and
 * `eng_lead` accounts.
 */
const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

describeWithDatabase('Estimate against Postgres', () => {
  const tag = randomBytes(4).toString('hex');
  let dataSource: DataSource;
  let service: EstimateService;
  let editor: EstimateEditService;
  let pricing: EstimatePricingService;
  let registry: ReferenceCheckRegistry;
  let notifications: { emit: jest.Mock };
  let salesA: number;
  let engineerA: number;
  let lead: number;
  let customerId: number;
  let itemId: number;
  let engineer: AuthUserPayload;
  let leadActor: AuthUserPayload;
  /** The sales owner of the requests: holds the price scope the engineers lack. */
  let salesActor: AuthUserPayload;
  const requestIds: number[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [
        SalesRequest,
        SalesRequestActivity,
        Estimate,
        EstimateRevision,
        EstimatePanel,
        EstimateBomLine,
        EstimateCostLine,
        Customer,
        Project,
        Contact,
        Item,
      ],
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }

    const accounts: Array<{ id: number; username: string }> =
      await dataSource.query(
        `SELECT id, username FROM users WHERE username IN ('sales_a', 'engineer_a', 'eng_lead')`,
      );
    const idOf = (username: string) =>
      accounts.find((account) => account.username === username)?.id;
    const [a, e, l] = [idOf('sales_a'), idOf('engineer_a'), idOf('eng_lead')];
    if (!a || !e || !l) {
      throw new Error(
        'The seeded sales_a, engineer_a and eng_lead accounts are missing: run `npm run seed`.',
      );
    }
    [salesA, engineerA, lead] = [a, e, l];
    engineer = { userId: engineerA, role: 'engineer' };
    leadActor = { userId: lead, role: 'engineeringLead' };
    salesActor = {
      userId: salesA,
      role: 'sales',
      permissions: seededRolePermissions('sales'),
    };

    registry = new ReferenceCheckRegistry();
    notifications = { emit: jest.fn().mockResolvedValue(1) };
    const users = {
      namesOf: () => Promise.resolve(new Map<number, string>()),
    };
    const crm = {
      getCustomerSummary: (id: number) =>
        Promise.resolve({ id, code: 'KH', name: 'Customer' }),
      getCustomerSummaries: () => Promise.resolve(new Map()),
    };
    service = new EstimateService(
      dataSource.getRepository(Estimate),
      dataSource.getRepository(EstimateRevision),
      dataSource.getRepository(SalesRequest),
      dataSource,
      new DataScopeService(),
      new RequestStatusPort(),
      users as never,
      crm as never,
      notifications as never,
      registry,
    );
    service.onModuleInit();
    editor = new EstimateEditService(dataSource, service);
    pricing = new EstimatePricingService(
      dataSource,
      service,
      new DataScopeService(),
    );

    const [customer]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO customers (code, name, sales_owner_id) VALUES ($1, 'EST race customer', $2) RETURNING id`,
      [`KH_ER${tag}`, salesA],
    );
    customerId = customer.id;
    const [item]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO items (code, name, item_group, unit, reference_price)
       VALUES ($1, 'EST race item', 'other', 'Cái', 1000) RETURNING id`,
      [`ER-${tag}`],
    );
    itemId = item.id;
  });

  beforeEach(() => {
    notifications.emit.mockClear();
  });

  afterEach(async () => {
    if (requestIds.length === 0) return;
    await dataSource.query(
      `DELETE FROM sales_estimates WHERE request_id = ANY($1)`,
      [requestIds],
    );
    await dataSource.query(
      `DELETE FROM sales_request_activities WHERE request_id = ANY($1)`,
      [requestIds],
    );
    await dataSource.query(`DELETE FROM sales_requests WHERE id = ANY($1)`, [
      requestIds,
    ]);
    requestIds.length = 0;
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    await dataSource.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    await dataSource.destroy();
  });

  /** A request assigned to engineer A, at `status`, tracked for cleanup. */
  async function assignedRequest(status = 'assigned') {
    const code = `YC_ER${randomBytes(5).toString('hex')}`;
    const [row]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO sales_requests (code, customer_id, title, sales_owner_id, assigned_engineer_id, status)
       VALUES ($1, $2, 'EST race request', $3, $4, $5) RETURNING id`,
      [code, customerId, salesA, engineerA, status],
    );
    requestIds.push(row.id);
    return { id: row.id, code };
  }

  /** A draft estimate holding one panel with one BOM line, ready to submit. */
  async function readyEstimate() {
    const request = await assignedRequest();
    const estimate = await service.create({ requestId: request.id }, engineer);
    const panels = await editor.addPanel(
      estimate.id,
      { tag: 'MSB-01', quantity: 2 },
      engineer,
    );
    await editor.addBomLine(
      estimate.id,
      panels.panels[0].id,
      { itemId, quantity: 2.5 },
      engineer,
    );
    return { request, estimate };
  }

  const revisionsOf = (estimateId: number) =>
    dataSource.query<Array<{ revision: number; status: string }>>(
      `SELECT revision, status FROM sales_estimate_revisions WHERE estimate_id = $1 ORDER BY revision`,
      [estimateId],
    );
  const requestStatus = async (id: number) =>
    (
      await dataSource.query<Array<{ status: string }>>(
        `SELECT status FROM sales_requests WHERE id = $1`,
        [id],
      )
    )[0].status;

  const outcomes = (results: Array<PromiseSettledResult<unknown>>) => ({
    fulfilled: results.filter((r) => r.status === 'fulfilled').length,
    conflicts: results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof ConflictException,
    ).length,
  });

  it('stores the totals the server computed, as numbers', async () => {
    const { estimate } = await readyEstimate();

    const detail = await service.findOne(estimate.id, salesActor);

    // 2.5 × 1,000 = 2,500 per panel, two panels.
    expect(detail.total).toBe(5000);
    expect(detail.current.panels[0]).toMatchObject({
      unitCost: 2500,
      total: 5000,
      bomLines: [{ quantity: 2.5, unitCost: 1000, amount: 2500 }],
    });
  });

  it('lets exactly one of two concurrent submits through, with one notice and one status move', async () => {
    const { request, estimate } = await readyEstimate();

    const results = await Promise.allSettled([
      service.submit(estimate.id, engineer),
      service.submit(estimate.id, leadActor),
    ]);

    expect(outcomes(results)).toEqual({ fulfilled: 1, conflicts: 1 });
    expect(await revisionsOf(estimate.id)).toEqual([
      { revision: 1, status: 'submitted' },
    ]);
    expect(await requestStatus(request.id)).toBe('estimated');
    expect(notifications.emit).toHaveBeenCalledTimes(1);
  });

  it('lets exactly one of two concurrent revises open a draft', async () => {
    const { request, estimate } = await readyEstimate();
    await service.submit(estimate.id, engineer);
    notifications.emit.mockClear();

    const results = await Promise.allSettled([
      service.revise(estimate.id, engineer),
      service.revise(estimate.id, leadActor),
    ]);

    expect(outcomes(results)).toEqual({ fulfilled: 1, conflicts: 1 });
    expect(await revisionsOf(estimate.id)).toEqual([
      { revision: 1, status: 'submitted' },
      { revision: 2, status: 'draft' },
    ]);
    expect(await requestStatus(request.id)).toBe('estimated');
  });

  it('keeps one current submitted revision across a revise-and-submit followed by another round', async () => {
    const { estimate } = await readyEstimate();
    await service.submit(estimate.id, engineer);
    await service.revise(estimate.id, engineer);

    // A submit racing a second revise: the revise either sees the draft (409) or runs after.
    const results = await Promise.allSettled([
      service.submit(estimate.id, engineer),
      service.revise(estimate.id, engineer),
    ]);

    const rows = await revisionsOf(estimate.id);
    expect(rows.filter((row) => row.status === 'submitted')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'draft').length).toBeLessThan(2);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('refuses an edit that races a submit once the revision is frozen, and keeps the frozen figures', async () => {
    const { estimate } = await readyEstimate();
    const panelId = (await service.findOne(estimate.id, engineer)).current
      .panels[0].id;

    const results = await Promise.allSettled([
      service.submit(estimate.id, engineer),
      editor.updatePanel(estimate.id, panelId, { quantity: 9 }, engineer),
    ]);

    const [{ status }] = await revisionsOf(estimate.id);
    expect(status).toBe('submitted');
    const frozen = await service.findOne(estimate.id, salesActor);
    const quantity = frozen.current.panels[0].quantity;
    // Whichever ran first, the stored total always matches the stored quantity.
    expect(frozen.current.total).toBe(quantity * 2500);
    expect(results[0].status).toBe('fulfilled');
  });

  it('lets exactly one of two concurrent completes of the pricing through', async () => {
    const { estimate } = await readyEstimate();
    await service.submit(estimate.id, engineer);

    const results = await Promise.allSettled([
      pricing.complete(estimate.id, salesActor),
      pricing.complete(estimate.id, salesActor),
    ]);

    expect(outcomes(results)).toEqual({ fulfilled: 1, conflicts: 1 });
    const [row] = await dataSource.query<
      Array<{ priced_at: Date | null; priced_by: number | null }>
    >(
      `SELECT priced_at, priced_by FROM sales_estimate_revisions WHERE estimate_id = $1`,
      [estimate.id],
    );
    expect(row.priced_at).toBeInstanceOf(Date);
    expect(row.priced_by).toBe(salesA);
  });

  it('never prices the draft a racing revise opens: only revision 1 can carry the pricing', async () => {
    const { estimate } = await readyEstimate();
    await service.submit(estimate.id, engineer);

    const [priced, revised] = await Promise.allSettled([
      pricing.complete(estimate.id, salesActor),
      service.revise(estimate.id, engineer),
    ]);

    // The revise always opens the draft; the pricing either took the lock first or finds the draft (409).
    expect(revised.status).toBe('fulfilled');
    expect(
      priced.status === 'fulfilled' ||
        (priced.reason as unknown) instanceof ConflictException,
    ).toBe(true);
    const rows = await dataSource.query<
      Array<{ revision: number; priced_at: Date | null }>
    >(
      `SELECT revision, priced_at FROM sales_estimate_revisions WHERE estimate_id = $1 ORDER BY revision`,
      [estimate.id],
    );
    expect(rows[0].priced_at !== null).toBe(priced.status === 'fulfilled');
    expect(rows[1].priced_at).toBeNull();
  });

  it('gives two concurrent first drafts distinct codes', async () => {
    const [first, second] = await Promise.all([
      assignedRequest(),
      assignedRequest(),
    ]);

    const [a, b] = await Promise.all([
      service.create({ requestId: first.id }, engineer),
      service.create({ requestId: second.id }, engineer),
    ]);

    expect(a.code).not.toBe(b.code);
    expect(a.code).toMatch(/^DT_\d{4}_\d{4}$/);
    expect(await requestStatus(first.id)).toBe('estimating');
    expect(await requestStatus(second.id)).toBe('estimating');
  });

  it('lets only one of two concurrent creates for one request win', async () => {
    const request = await assignedRequest();

    const results = await Promise.allSettled([
      service.create({ requestId: request.id }, engineer),
      service.create({ requestId: request.id }, leadActor),
    ]);

    expect(outcomes(results)).toEqual({ fulfilled: 1, conflicts: 1 });
    const rows: unknown[] = await dataSource.query(
      `SELECT id FROM sales_estimates WHERE request_id = $1`,
      [request.id],
    );
    expect(rows).toHaveLength(1);
  });

  it('reports an item as referenced while a live estimate has a BOM line for it', async () => {
    const { request, estimate } = await readyEstimate();

    expect(await registry.referencingItem(itemId)).toEqual(['estimate']);

    await dataSource.query(
      `UPDATE sales_estimates SET is_deleted = true WHERE id = $1`,
      [estimate.id],
    );
    expect(await registry.referencingItem(itemId)).toEqual([]);
    expect(request.id).toBeGreaterThan(0);
  });

  it('serialises adding a BOM line with deleting its item: the line or the delete wins, never both', async () => {
    const { estimate } = await readyEstimate();
    const panelId = (await service.findOne(estimate.id, engineer)).current
      .panels[0].id;
    const items = new ItemService(dataSource.getRepository(Item), registry);

    for (let round = 0; round < 4; round++) {
      const [row]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO items (code, name, item_group, unit) VALUES ($1, 'EST race item', 'other', 'Cái') RETURNING id`,
        [`ER-${tag}-${round}`],
      );
      const [added, removed] = await Promise.allSettled([
        editor.addBomLine(
          estimate.id,
          panelId,
          { itemId: row.id, quantity: 1 },
          engineer,
        ),
        items.remove(row.id, { userId: lead, role: 'engineeringLead' }),
      ]);

      const lines: unknown[] = await dataSource.query(
        `SELECT id FROM sales_estimate_bom_lines WHERE item_id = $1`,
        [row.id],
      );
      const [{ is_deleted }]: Array<{ is_deleted: boolean }> =
        await dataSource.query(`SELECT is_deleted FROM items WHERE id = $1`, [
          row.id,
        ]);
      if (lines.length > 0) {
        expect(added.status).toBe('fulfilled');
        expect(removed.status).toBe('rejected');
        expect((removed as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictException,
        );
        expect(is_deleted).toBe(false);
      } else {
        expect(removed.status).toBe('fulfilled');
        expect((added as PromiseRejectedResult).reason).toBeInstanceOf(
          NotFoundException,
        );
        expect(is_deleted).toBe(true);
      }
    }
    await dataSource.query(`DELETE FROM sales_estimates WHERE id = $1`, [
      estimate.id,
    ]);
    await dataSource.query(`DELETE FROM items WHERE code LIKE $1`, [
      `ER-${tag}-%`,
    ]);
  });

  it('finds an estimate by its own code or by its request code, accent- and case-insensitively', async () => {
    const { request, estimate } = await readyEstimate();
    const ids = async (search: string) =>
      (await service.findAll({ search }, leadActor)).data.map((row) => row.id);

    expect(await ids(estimate.code.toLowerCase())).toContain(estimate.id);
    expect(await ids(request.code.slice(3))).toContain(estimate.id);
    expect(await ids(`nomatch-${tag}`)).toEqual([]);
  });

  it('rejects a second live estimate and a second draft at the database', async () => {
    const { request, estimate } = await readyEstimate();

    await expect(
      dataSource.query(
        `INSERT INTO sales_estimates (code, request_id) VALUES ($1, $2)`,
        [`DT_9999_${tag}`, request.id],
      ),
    ).rejects.toMatchObject({ constraint: 'uq_sales_estimates_request_id' });
    await expect(
      dataSource.query(
        `INSERT INTO sales_estimate_revisions (estimate_id, revision, status) VALUES ($1, 2, 'draft')`,
        [estimate.id],
      ),
    ).rejects.toMatchObject({
      constraint: 'uq_sales_estimate_revisions_one_draft',
    });
  });
});
