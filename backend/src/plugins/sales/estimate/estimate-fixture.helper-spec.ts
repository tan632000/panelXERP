import { DataScopeService } from '@shared/services/data-scope.service';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { EstimateReadPort } from '@plugins/sales/_shared/ports/estimate-read.port';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import {
  ENGINEER_A,
  SalesFakeRepo,
} from '@plugins/sales/request/request-fixture.helper-spec';

import type { FakeRow } from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import type { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

/**
 * In-memory stand-ins for what the estimate services touch: the request, estimate and item
 * tables, a transaction that really rolls back, the unique indexes the migration creates, the
 * account lookup, the CRM gateway and the notification service. Named `*-spec.ts` so the
 * production build leaves it out.
 */

type Row<T> = T & FakeRow;

/** The catalog item columns the estimate reads; the catalog entity itself is not importable here. */
interface ItemRow extends FakeRow {
  id: number;
  code: string;
  name: string;
  brand: string | null;
  group: string;
  unit: string;
  referencePrice: number | null;
}

const accountNames: Record<number, string> = {
  11: 'Sales A',
  12: 'Sales B',
  20: 'Manager',
  30: 'Engineer A',
  31: 'Engineer B',
  40: 'Lead',
};

export function buildEstimateFixture(
  options: { registerReferenceChecks?: boolean } = {},
) {
  const requests = new SalesFakeRepo<Row<SalesRequest>>({
    unique: [
      {
        constraint: 'uq_sales_requests_code',
        collides: (a, b) => a.code === b.code,
      },
    ],
  });
  const activities = new SalesFakeRepo<Row<SalesRequestActivity>>();
  const estimates = new SalesFakeRepo<Row<Estimate>>({
    unique: [
      {
        constraint: 'uq_sales_estimates_code',
        collides: (a, b) => a.code === b.code,
      },
      {
        constraint: 'uq_sales_estimates_request_id',
        collides: (a, b) => a.requestId === b.requestId,
      },
    ],
  });
  const revisions = new SalesFakeRepo<Row<EstimateRevision>>({
    unique: [
      {
        constraint: 'uq_sales_estimate_revisions_number',
        collides: (a, b) =>
          a.estimateId === b.estimateId && a.revision === b.revision,
      },
      {
        constraint: 'uq_sales_estimate_revisions_one_draft',
        collides: (a, b) =>
          a.estimateId === b.estimateId &&
          a.status === EstimateRevisionStatus.DRAFT &&
          b.status === EstimateRevisionStatus.DRAFT,
      },
      {
        constraint: 'uq_sales_estimate_revisions_one_submitted',
        collides: (a, b) =>
          a.estimateId === b.estimateId &&
          a.status === EstimateRevisionStatus.SUBMITTED &&
          b.status === EstimateRevisionStatus.SUBMITTED,
      },
    ],
  });
  const panels = new SalesFakeRepo<Row<EstimatePanel>>({
    unique: [
      {
        constraint: 'uq_sales_estimate_panels_tag',
        collides: (a, b) =>
          a.revisionId === b.revisionId &&
          a.tag.toLowerCase() === b.tag.toLowerCase(),
      },
    ],
  });
  const bomLines = new SalesFakeRepo<Row<EstimateBomLine>>();
  const costLines = new SalesFakeRepo<Row<EstimateCostLine>>();
  const items = new SalesFakeRepo<ItemRow>();

  const repos = new Map<unknown, SalesFakeRepo<FakeRow>>([
    [SalesRequest, requests],
    [SalesRequestActivity, activities],
    [Estimate, estimates],
    [EstimateRevision, revisions],
    [EstimatePanel, panels],
    [EstimateBomLine, bomLines],
    [EstimateCostLine, costLines],
  ] as Array<[unknown, SalesFakeRepo<FakeRow>]>);

  /** Emulates `previewMaxBasedCode`'s query: the highest number among the codes matching. */
  const query = jest.fn((sql: string, [param]: [string | number]) => {
    // The shared item read of an added BOM line: the live row, in the table's own columns.
    if (sql.includes('FROM items')) {
      const item = items.rows.find(
        (row) => row.id === param && !row.isDeleted && !row.deletedAt,
      );
      return Promise.resolve(
        item
          ? [
              {
                id: item.id,
                code: item.code,
                name: item.name,
                brand: item.brand,
                unit: item.unit,
                reference_price: item.referencePrice,
              },
            ]
          : [],
      );
    }
    const pattern = param as string;
    const matcher = new RegExp(pattern);
    const codes = estimates.rows
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

  const dataSource = {
    manager,
    /** The item delete check's statement: any BOM line naming the item. */
    query: jest.fn((_sql: string, [itemId]: [number]) =>
      Promise.resolve(
        bomLines.rows.some((line) => line.itemId === itemId) ? [{}] : [],
      ),
    ),
    /** Runs `work` and, when it throws, puts every table back as it was. */
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

  const users = {
    namesOf: jest.fn((ids: ReadonlyArray<number | null | undefined>) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id): id is number => typeof id === 'number')
            .filter((id) => id in accountNames)
            .map((id) => [id, accountNames[id]]),
        ),
      ),
    ),
  };
  const crm = {
    getCustomerSummary: jest.fn((id: number) =>
      Promise.resolve({ id, code: `KH_${id}`, name: `Customer ${id}` }),
    ),
    getCustomerSummaries: jest.fn((ids: readonly number[]) =>
      Promise.resolve(
        new Map(
          ids.map((id) => [
            id,
            { id, code: `KH_${id}`, name: `Customer ${id}` },
          ]),
        ),
      ),
    ),
  };
  const notifications = { emit: jest.fn().mockResolvedValue(1) };

  const registry = new ReferenceCheckRegistry();
  const dataScope = new DataScopeService();
  const statusPort = new RequestStatusPort();

  const service = new EstimateService(
    estimates as never,
    revisions as never,
    requests as never,
    dataSource as never,
    dataScope,
    statusPort,
    users as never,
    crm as never,
    notifications as never,
    registry,
  );
  const editor = new EstimateEditService(dataSource as never, service);
  const readPort = new EstimateReadPort();
  // A Nest app calls this itself when it initialises the service, so it may opt out.
  if (options.registerReferenceChecks ?? true) service.onModuleInit();

  /** A request stored straight in the table at `status`, assigned to engineer A by default. */
  const requestAt = (
    status: RequestStatus,
    overrides: Partial<SalesRequest> = {},
  ) =>
    requests.seed({
      code: `YC_2027_${String(requests.rows.length + 1).padStart(4, '0')}`,
      customerId: 1,
      title: 'Seeded request',
      salesOwnerId: 11,
      assignedEngineerId: ENGINEER_A.userId,
      status,
      ...overrides,
    } as never);

  let nextItem = 1;
  /** A live catalog item. */
  const itemOf = (overrides: Partial<ItemRow> = {}) => {
    const n = nextItem++;
    return items.seed({
      code: `ITEM-${n}`,
      name: `Item ${n}`,
      brand: 'Schneider',
      group: 'other',
      unit: 'Cái',
      referencePrice: null,
      ...overrides,
    });
  };

  return {
    service,
    editor,
    readPort,
    statusPort,
    registry,
    requests,
    activities,
    estimates,
    revisions,
    panels,
    bomLines,
    costLines,
    items,
    manager,
    dataSource,
    notifications,
    users,
    crm,
    requestAt,
    itemOf,
  };
}

export type EstimateFixture = ReturnType<typeof buildEstimateFixture>;
