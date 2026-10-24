import { randomBytes } from 'crypto';

import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestService } from '@plugins/sales/request/services/request.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * A request created while CRM reassigns its customer, against the real Postgres of the compose
 * stack: the create reads the owner under a shared row lock inside its transaction, so it waits
 * for the reassignment and ends up with the new owner instead of committing the old one past
 * the owner-change hook.
 *
 * An unreachable database fails the suite; `SKIP_DB_SPECS=1` is the one explicit opt-out, and
 * then jest reports these as skipped. Needs the seeded `sales_a` and `sales_b` accounts.
 */
const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeWithDatabase('RequestService.create against Postgres', () => {
  const customerCode = `KH_RC${randomBytes(4).toString('hex')}`;
  let dataSource: DataSource;
  let salesA: number;
  let salesB: number;
  let customerId: number;
  let service: RequestService;

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
        Customer,
        Project,
        Contact,
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
        `SELECT id, username FROM users WHERE username IN ('sales_a', 'sales_b')`,
      );
    const idOf = (username: string) =>
      accounts.find((account) => account.username === username)?.id;
    const [a, b] = [idOf('sales_a'), idOf('sales_b')];
    if (!a || !b) {
      throw new Error(
        'The seeded sales_a and sales_b accounts are missing: run `npm run seed`.',
      );
    }
    [salesA, salesB] = [a, b];

    const users = {
      namesOf: () => Promise.resolve(new Map<number, string>()),
    };
    service = new RequestService(
      dataSource.getRepository(SalesRequest),
      dataSource.getRepository(SalesRequestActivity),
      dataSource,
      new DataScopeService(),
      new CrmGateway(
        dataSource.getRepository(Customer),
        dataSource.getRepository(Project),
        dataSource.getRepository(Contact),
      ),
      users as never,
      { emit: jest.fn() } as never,
      new RequestStatusPort(),
      new ReferenceCheckRegistry(),
      new CustomerOwnerChangeRegistry(),
    );
  });

  beforeEach(async () => {
    const [{ id }]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO customers (code, name, sales_owner_id) VALUES ($1, 'RACE customer', $2) RETURNING id`,
      [customerCode, salesA],
    );
    customerId = id;
  });

  afterEach(async () => {
    await dataSource.query(
      `DELETE FROM sales_request_activities WHERE request_id IN (SELECT id FROM sales_requests WHERE customer_id = $1)`,
      [customerId],
    );
    await dataSource.query(
      `DELETE FROM sales_requests WHERE customer_id = $1`,
      [customerId],
    );
    await dataSource.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  /**
   * Starts `create` while another transaction holds the customer row (as a CRM reassignment
   * does), proves the create waits, then lets the reassignment commit and returns the outcome.
   */
  async function createDuringReassignment(actor: AuthUserPayload) {
    const reassigning = dataSource.createQueryRunner();
    await reassigning.connect();
    await reassigning.startTransaction();
    await reassigning.query(
      `SELECT id FROM customers WHERE id = $1 FOR UPDATE`,
      [customerId],
    );

    let settled = false;
    const outcome = service
      .create({ customerId, title: 'RACE request' }, actor)
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      .finally(() => {
        settled = true;
      });

    await sleep(600);
    const waitedForTheReassignment = !settled;

    await reassigning.query(
      `UPDATE customers SET sales_owner_id = $1 WHERE id = $2`,
      [salesB, customerId],
    );
    await reassigning.commitTransaction();
    await reassigning.release();

    return { waitedForTheReassignment, result: await outcome };
  }

  it('waits for the reassignment and is created with the new owner', async () => {
    const { waitedForTheReassignment, result } = await createDuringReassignment(
      {
        userId: salesA,
        role: 'salesManager',
      },
    );

    expect(waitedForTheReassignment).toBe(true);
    expect(result).toHaveProperty('value');
    const [row]: Array<{ sales_owner_id: number }> = await dataSource.query(
      `SELECT sales_owner_id FROM sales_requests WHERE customer_id = $1`,
      [customerId],
    );
    expect(row.sales_owner_id).toBe(salesB);
  });

  it('answers 404 to the old owner who no longer owns the customer, and inserts nothing', async () => {
    const { waitedForTheReassignment, result } = await createDuringReassignment(
      {
        userId: salesA,
        role: 'sales',
      },
    );

    expect(waitedForTheReassignment).toBe(true);
    expect(result).toHaveProperty('error');
    expect((result as { error: unknown }).error).toBeInstanceOf(
      NotFoundException,
    );
    const rows: unknown[] = await dataSource.query(
      `SELECT id FROM sales_requests WHERE customer_id = $1`,
      [customerId],
    );
    expect(rows).toHaveLength(0);
  });
});
