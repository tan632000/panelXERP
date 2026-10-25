import { Readable } from 'stream';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  FakeRepo,
  matchesWhere,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { RequestCloseRegistry } from '@plugins/sales/_shared/ports/request-close-registry';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequestAttachment } from '@plugins/sales/request/entities/request-attachment.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestAttachmentService } from '@plugins/sales/request/services/request-attachment.service';
import { RequestService } from '@plugins/sales/request/services/request.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type {
  ContactSummary,
  CustomerSummary,
  ProjectSummary,
} from '@plugins/crm/_shared/gateways/crm-gateway';
import type { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

/**
 * In-memory stand-ins for what the request services touch: the three tables, a transaction
 * that really rolls back, the CRM gateway, the account lookup, the notification service and
 * object storage. Named `*-spec.ts` so the production build leaves it out.
 */

export const SALES_A: AuthUserPayload = { userId: 11, role: 'sales' };
export const SALES_B: AuthUserPayload = { userId: 12, role: 'sales' };
export const MANAGER: AuthUserPayload = { userId: 20, role: 'salesManager' };
export const ENGINEER_A: AuthUserPayload = { userId: 30, role: 'engineer' };
export const ENGINEER_B: AuthUserPayload = { userId: 31, role: 'engineer' };
export const LEAD: AuthUserPayload = { userId: 40, role: 'engineeringLead' };

type Where = Record<string, unknown>;

/** The repository calls the request services add on top of what the CRM helper offers. */
export class SalesFakeRepo<T extends FakeRow> extends FakeRepo<T> {
  count = jest.fn(({ where }: { where?: Where }): Promise<number> => {
    const matching = this.rows.filter(
      (row) => !where || matchesWhere(row as unknown as Where, where),
    );
    return Promise.resolve(matching.length);
  });

  delete = jest.fn((where: Where): Promise<void> => {
    this.rows = this.rows.filter(
      (row) => !matchesWhere(row as unknown as Where, where),
    );
    return Promise.resolve();
  });
}

interface Account {
  fullName: string;
  roles: string[];
  active: boolean;
}

/** One built world: tables, collaborators and the services wired onto them. */
export function buildRequestFixture(
  options: { registerReferenceChecks?: boolean } = {},
) {
  const requests = new SalesFakeRepo<SalesRequest & FakeRow>({
    unique: [
      {
        constraint: 'uq_sales_requests_code',
        collides: (a, b) => a.code === b.code,
      },
    ],
  });
  const activities = new SalesFakeRepo<SalesRequestActivity & FakeRow>();
  const attachments = new SalesFakeRepo<SalesRequestAttachment & FakeRow>();
  const repos = new Map<unknown, SalesFakeRepo<FakeRow>>([
    [SalesRequest, requests],
    [SalesRequestActivity, activities],
    [SalesRequestAttachment, attachments],
  ]);

  /** Emulates `previewMaxBasedCode`'s query: the highest number among codes matching the pattern. */
  const query = jest.fn((_sql: string, [pattern]: [string]) => {
    const matcher = new RegExp(pattern);
    const codes = requests.rows
      .map((row) => row.code)
      .filter((code) => matcher.test(code))
      .sort(
        (a, b) =>
          Number(/\d+$/.exec(b)?.[0] ?? 0) - Number(/\d+$/.exec(a)?.[0] ?? 0),
      );
    return Promise.resolve(codes.length ? [{ code: codes[0] }] : []);
  });

  const manager = {
    getRepository: (target: unknown) => repos.get(target),
    query,
  };

  /** Runs `work` and, when it throws, puts every table back as it was — a real rollback. */
  const dataSource = {
    transaction: jest.fn(async <R>(work: (m: typeof manager) => Promise<R>) => {
      const snapshots = [...repos.values()].map((repo) => ({
        repo,
        rows: repo.rows.map((row) => ({ ...row })),
      }));
      try {
        return await work(manager);
      } catch (error) {
        for (const { repo, rows } of snapshots) repo.rows = rows;
        throw error;
      }
    }),
  };

  const customers = new Map<number, CustomerSummary>();
  const projects = new Map<number, ProjectSummary>();
  const contacts = new Map<number, ContactSummary>();
  let nextRef = 100;

  const crm = {
    getCustomerSummary: jest.fn((id: number) =>
      Promise.resolve(customers.get(id) ?? null),
    ),
    getCustomerSummaries: jest.fn((ids: readonly number[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id) => customers.has(id))
            .map((id) => [id, customers.get(id) as CustomerSummary]),
        ),
      ),
    ),
    /** Reads the owner as the transaction would; a test may change it after the outer read. */
    lockCustomerOwner: jest.fn((_manager: unknown, id: number) => {
      const customer = customers.get(id);
      return Promise.resolve(
        customer && !customer.isDeleted ? customer.salesOwnerId : null,
      );
    }),
    getProjectSummary: jest.fn((id: number) =>
      Promise.resolve(projects.get(id) ?? null),
    ),
    getContactSummary: jest.fn((id: number) =>
      Promise.resolve(contacts.get(id) ?? null),
    ),
  };

  const accounts = new Map<number, Account>();
  const users = {
    hasActiveRole: jest.fn(
      (userId: number, roleCodes: readonly string[]): Promise<boolean> => {
        const account = accounts.get(userId);
        return Promise.resolve(
          !!account &&
            account.active &&
            account.roles.some((role) => roleCodes.includes(role)),
        );
      },
    ),
    listActiveWithRoles: jest.fn((roleCodes: readonly string[]) =>
      Promise.resolve(
        [...accounts]
          .filter(
            ([, a]) => a.active && a.roles.some((r) => roleCodes.includes(r)),
          )
          .map(([id, a]) => ({ id, fullName: a.fullName })),
      ),
    ),
    namesOf: jest.fn((ids: ReadonlyArray<number | null | undefined>) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id): id is number => typeof id === 'number')
            .filter((id) => accounts.has(id))
            .map((id) => [id, (accounts.get(id) as Account).fullName]),
        ),
      ),
    ),
  };

  const notifications = { emit: jest.fn().mockResolvedValue(1) };

  const stored = new Map<string, Buffer>();
  const storage = {
    upload: jest.fn((key: string, body: Buffer) => {
      stored.set(key, body);
      return Promise.resolve({ key, bucket: 'test' });
    }),
    deleteObject: jest.fn((key: string) => {
      stored.delete(key);
      return Promise.resolve();
    }),
    getObjectStream: jest.fn((key: string) => {
      const body = stored.get(key);
      if (!body) {
        return Promise.reject(
          Object.assign(new Error('no such key'), { name: 'NoSuchKey' }),
        );
      }
      return Promise.resolve(Readable.from(body));
    }),
  };

  const registry = new ReferenceCheckRegistry();
  const ownerChanges = new CustomerOwnerChangeRegistry();
  const dataScope = new DataScopeService();
  const statusPort = new RequestStatusPort();

  const service = new RequestService(
    requests as never,
    activities as never,
    dataSource as never,
    dataScope,
    crm as never,
    users as never,
    notifications as never,
    statusPort,
    registry,
    ownerChanges,
    new RequestCloseRegistry(),
  );
  const attachmentService = new RequestAttachmentService(
    attachments as never,
    dataSource as never,
    service,
    storage as never,
  );
  // A Nest app calls this itself when it initialises the service, so it may opt out.
  if (options.registerReferenceChecks ?? true) service.onModuleInit();

  /** Registers a live account holding the roles. */
  const account = (
    userId: number,
    fullName: string,
    roles: string[],
    active = true,
  ) => accounts.set(userId, { fullName, roles, active });
  account(SALES_A.userId, 'Sales A', ['sales']);
  account(SALES_B.userId, 'Sales B', ['sales']);
  account(MANAGER.userId, 'Manager', ['salesManager']);
  account(ENGINEER_A.userId, 'Engineer A', ['engineer']);
  account(ENGINEER_B.userId, 'Engineer B', ['engineer']);
  account(LEAD.userId, 'Lead', ['engineeringLead']);

  const customerOf = (
    salesOwnerId: number,
    code = 'KH_0001',
    extra: Partial<CustomerSummary> = {},
  ): CustomerSummary => {
    const id = nextRef++;
    const summary: CustomerSummary = {
      id,
      code,
      name: `Customer ${code}`,
      taxCode: '0101234567',
      address: '1 Demo Street',
      salesOwnerId,
      isDeleted: false,
      ...extra,
    };
    customers.set(id, summary);
    return summary;
  };
  const projectOf = (
    customerId: number,
    extra: Partial<ProjectSummary> = {},
  ): ProjectSummary => {
    const id = nextRef++;
    const summary: ProjectSummary = {
      id,
      code: `DA_${id}`,
      name: 'Tower A',
      siteAddress: '1 Site Road',
      customerId,
      isDeleted: false,
      ...extra,
    };
    projects.set(id, summary);
    return summary;
  };
  const contactOf = (
    customerId: number,
    extra: Partial<ContactSummary> = {},
  ): ContactSummary => {
    const id = nextRef++;
    const summary: ContactSummary = {
      id,
      customerId,
      name: 'Nguyen An',
      position: 'Buyer',
      phone: '0900000001',
      email: 'an@example.com',
      isDeleted: false,
      ...extra,
    };
    contacts.set(id, summary);
    return summary;
  };

  return {
    service,
    attachmentService,
    statusPort,
    registry,
    ownerChanges,
    requests,
    activities,
    attachments,
    manager,
    dataSource,
    crm,
    users,
    notifications,
    storage,
    stored,
    account,
    customerOf,
    projectOf,
    contactOf,
  };
}

export type RequestFixture = ReturnType<typeof buildRequestFixture>;

/** A draft request of `owner`'s own customer, created through the service. */
export async function createDraft(
  fixture: RequestFixture,
  owner: AuthUserPayload = SALES_A,
  overrides: { title?: string } = {},
) {
  const customer = fixture.customerOf(owner.userId);
  return fixture.service.create(
    { customerId: customer.id, title: overrides.title ?? 'Panel line quote' },
    owner,
  );
}

/** A request stored straight in the table at `status`, bypassing the transitions that lead there. */
export function seedRequest(
  fixture: RequestFixture,
  status: RequestStatus,
  overrides: Partial<SalesRequest> = {},
) {
  return fixture.requests.seed({
    code: `YC_2027_${String(fixture.requests.rows.length + 1).padStart(4, '0')}`,
    customerId: 1,
    title: 'Seeded request',
    salesOwnerId: SALES_A.userId,
    assignedEngineerId: null,
    status,
    ...overrides,
  } as never);
}
