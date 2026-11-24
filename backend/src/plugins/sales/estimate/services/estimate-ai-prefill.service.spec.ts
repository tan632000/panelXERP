import { getQueueOptionsToken } from '@nestjs/bull';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';

import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { DataScopeService } from '@shared/services/data-scope.service';

import { AiRateLimitedError } from '@plugins/sales/estimate/ai/ai-errors';
import {
  ESTIMATE_AI_JOB,
  ESTIMATE_AI_QUEUE,
  ESTIMATE_AI_QUEUE_SETTINGS,
  ESTIMATE_AI_SETTINGS,
  ESTIMATE_AI_CLIENT,
  ESTIMATE_AI_FILLED_EVENT,
  ESTIMATE_AI_FAILED_EVENT,
} from '@plugins/sales/estimate/constants/estimate-ai.constant';
import { EstimateAiPrefillProcessor } from '@plugins/sales/estimate/estimate-ai-prefill.processor';
import { EstimateAiController } from '@plugins/sales/estimate/estimate-ai.controller';
import {
  buildEstimateFixture,
  type EstimateFixture,
} from '@plugins/sales/estimate/estimate-fixture.helper-spec';
import { EstimateModule } from '@plugins/sales/estimate/estimate.module';
import { ESTIMATE_AI_PREFILL } from '@plugins/sales/estimate/permissions/estimate.permissions';
import { EstimateAiPrefillService } from '@plugins/sales/estimate/services/estimate-ai-prefill.service';
import { EstimateAiSweeperService } from '@plugins/sales/estimate/services/estimate-ai-sweeper.service';
import { EstimateAiWriterService } from '@plugins/sales/estimate/services/estimate-ai-writer.service';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { SalesRequest } from '@plugins/sales/request/entities/request.entity';

const actorOf = (userId: number, role: string): AuthUserPayload => ({
  userId,
  role,
  permissions: seededRolePermissions(role) ?? [],
});
const SALES = actorOf(11, 'sales');
const OTHER_SALES = actorOf(12, 'sales');
const MANAGER = actorOf(20, 'salesManager');
const DIRECTOR = actorOf(50, 'director');
const ADMIN = actorOf(1, 'admin');
const ENGINEER = actorOf(30, 'engineer');
const OTHER_ENGINEER = actorOf(31, 'engineer');

const MONEY = /85[.,]?000|1[.,]200[.,]000/;
const MONEY_TEXT = 'Đơn giá 85.000.000đ, thành tiền 1.200.000 VND';

interface TemplateRow {
  panel_id: number;
  tag: string;
  description: string | null;
  panel_quantity: number;
  item_id: number | null;
  line_quantity: string | null;
  group_label: string | null;
  note: string | null;
}

/** The whole feature wired on the in-memory estimate world, with a fake AI client and a manual queue. */
function build(options: { apiKey?: string } = {}) {
  const fx = buildEstimateFixture();
  const jobs: Array<{
    name: string;
    data: { runId: number };
    opts: Record<string, unknown>;
  }> = [];
  const queue = {
    add: jest.fn((name: string, data: { runId: number }, opts: never) => {
      jobs.push({ name, data, opts });
      return Promise.resolve({});
    }),
  };
  const client = {
    extract: jest.fn<Promise<unknown>, [{ content: unknown }]>(),
  };
  const storage = {
    getObjectBuffer: jest.fn(() => Promise.resolve(Buffer.from('%PDF-1.4'))),
  };
  const settings = {
    apiKey: 'apiKey' in options ? options.apiKey : 'test-key',
    model: 'test-model',
  };
  let catalogCount: number | null = null;
  let templateRows: TemplateRow[] = [];

  const baseQuery = fx.manager.query.getMockImplementation() as (
    sql: string,
    params: unknown[],
  ) => Promise<unknown[]>;
  const answer = (sql: string, params: unknown[]): Promise<unknown[]> => {
    if (sql.includes('COUNT(*)') && sql.includes('FROM items')) {
      const live = fx.items.rows.filter((row) => !row.isDeleted).length;
      return Promise.resolve([{ n: catalogCount ?? live }]);
    }
    if (sql.includes('FROM items') && sql.includes('ORDER BY')) {
      return Promise.resolve(
        fx.items.rows
          .filter((row) => !row.isDeleted)
          .map(({ id, code, name, brand, unit }) => ({
            id,
            code,
            name,
            brand,
            unit,
          })),
      );
    }
    if (sql.includes('COUNT(*)') && sql.includes('sales_estimate_ai_runs')) {
      const since = Date.now() - 24 * 3600 * 1000;
      const n = fx.aiRuns.rows.filter(
        (row) =>
          row.createdBy === params[0] &&
          (!row.createdAt || row.createdAt.getTime() >= since),
      ).length;
      return Promise.resolve([{ n }]);
    }
    if (sql.includes('quotation_templates')) {
      return Promise.resolve(templateRows);
    }
    if (sql.includes("SET status = 'running'")) {
      const row = fx.aiRuns.rows.find(
        (r) => r.id === params[0] && (r.status as string) === 'queued',
      );
      if (row) row.status = 'running' as never;
      return Promise.resolve([row ? [{ id: row.id }] : [], row ? 1 : 0]);
    }
    if (sql.startsWith('UPDATE sales_estimate_ai_runs')) {
      const [error, cutoff] = params as [string, Date];
      const stuck = fx.aiRuns.rows.filter(
        (row) =>
          ['queued', 'running'].includes(row.status) &&
          (row.createdAt ?? new Date()) < cutoff,
      );
      for (const row of stuck) {
        row.status = 'failed' as never;
        row.error = error;
      }
      return Promise.resolve([
        stuck.map((row) => ({
          id: row.id,
          request_id: row.requestId,
          created_by: row.createdBy,
        })),
        stuck.length,
      ]);
    }
    return baseQuery(sql, params);
  };
  fx.manager.query.mockImplementation(answer as never);

  const writer = new EstimateAiWriterService(
    fx.dataSource as never,
    fx.statusPort,
  );
  const prefill = new EstimateAiPrefillService(
    fx.dataSource as never,
    new DataScopeService(),
    queue as never,
    settings,
    client,
    storage as never,
    writer,
    fx.notifications as never,
  );
  const sweeper = new EstimateAiSweeperService(fx.dataSource as never, prefill);

  const drain = async () => {
    while (jobs.length > 0) {
      const job = jobs.shift();
      if (job) await prefill.execute(job.data.runId);
    }
  };

  /** A request owned by SALES with plain requirements, ready for a run. */
  const requestOf = (
    status: RequestStatus = RequestStatus.ASSIGNED,
    overrides: Partial<SalesRequest> = {},
  ) =>
    fx.requestAt(status, {
      technicalRequirements: 'Tủ MSB 3 pha 400V',
      ...overrides,
    });

  const catalog = (n = 2) =>
    Array.from({ length: n }, (_, i) =>
      fx.itemOf({ referencePrice: 1000 * (i + 1) }),
    );

  /** A well-formed tool input over the given items. */
  const output = (
    items: Array<{ id: number }>,
    extra: Record<string, unknown> = {},
  ) => ({
    requirementsSummary: 'Tủ MSB 3 pha',
    panels: [
      {
        tag: 'MSB-01',
        description: 'Tủ chính',
        quantity: 2,
        aiNote: 'Từ bản vẽ',
        rows: [
          ...items.map((item, i) => ({
            where: 'Tủ chính',
            text: 'Vật tư',
            code: '',
            quantity: i + 1,
            itemId: item.id,
            confidence: 0.9,
            note: 'khớp',
          })),
          {
            where: 'Tủ chính',
            text: 'Đèn lạ',
            code: '',
            quantity: 1,
            itemId: null,
            confidence: 0.5,
            note: 'Không có trong danh mục',
          },
        ],
      },
    ],
    ...extra,
  });

  return {
    fx,
    jobs,
    queue,
    client,
    storage,
    writer,
    prefill,
    sweeper,
    drain,
    requestOf,
    catalog,
    output,
    setCatalogCount: (n: number) => (catalogCount = n),
    setTemplateRows: (rows: TemplateRow[]) => (templateRows = rows),
  };
}
type Harness = ReturnType<typeof build>;

/** Triggers a run for `request` as `actor` and executes it. */
async function runFor(
  h: Harness,
  request: { id: number },
  actor: AuthUserPayload = SALES,
) {
  const { runId } = await h.prefill.trigger({ requestId: request.id }, actor);
  await h.drain();
  return runId;
}

const runRow = (h: Harness, id: number) =>
  h.fx.aiRuns.rows.find((row) => row.id === id) as NonNullable<
    EstimateFixture['aiRuns']['rows'][number]
  >;

const statusOf = (h: Harness, id: number) =>
  h.fx.requests.rows.find((row) => row.id === id)?.status;

const stringsOf = (h: Harness): string[] => [
  ...h.fx.panels.rows.flatMap((p) => [p.description ?? '', p.aiNote ?? '']),
  ...h.fx.bomLines.rows.flatMap((l) => [l.note ?? '', l.aiNote ?? '']),
  ...h.fx.activities.rows.map((a) => a.note ?? ''),
  ...h.fx.requests.rows.map((r) => r.technicalRequirements ?? ''),
  ...h.fx.aiRuns.rows.map((r) => `${r.summary ?? ''} ${r.error ?? ''}`),
  ...h.fx.notifications.emit.mock.calls.map((call: unknown[]) =>
    JSON.stringify(call[0]),
  ),
];

describe('EstimateAiPrefillService', () => {
  describe('trigger', () => {
    it('answers a run id for the owner and queues one job that is never retried', async () => {
      const h = build();
      const request = h.requestOf();

      const { runId } = await h.prefill.trigger(
        { requestId: request.id },
        SALES,
      );

      expect(runRow(h, runId)).toMatchObject({
        status: 'queued',
        requestId: request.id,
        createdBy: SALES.userId,
      });
      expect(h.queue.add).toHaveBeenCalledWith(
        ESTIMATE_AI_JOB,
        { runId },
        expect.objectContaining({ attempts: 1 }) as never,
      );
    });

    it.each([
      ['salesManager', MANAGER],
      ['director', DIRECTOR],
    ])('lets a %s start a run', async (_name, actor) => {
      const h = build();
      const request = h.requestOf(RequestStatus.DRAFT);

      await expect(
        h.prefill.trigger({ requestId: request.id }, actor),
      ).resolves.toEqual({ runId: expect.any(Number) as number });
    });

    it('hides the request of another sales owner behind a 404', async () => {
      const h = build();
      const request = h.requestOf();

      await expect(
        h.prefill.trigger({ requestId: request.id }, OTHER_SALES),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(h.fx.aiRuns.rows).toHaveLength(0);
    });

    it.each([
      ['engineer', ENGINEER],
      ['admin', ADMIN],
    ])('refuses a %s with 403 and queues nothing', async (_name, actor) => {
      const h = build();
      const request = h.requestOf();

      await expect(
        h.prefill.trigger({ requestId: request.id }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.queue.add).not.toHaveBeenCalled();
    });

    it.each([RequestStatus.ESTIMATING, RequestStatus.ESTIMATED])(
      'refuses a request that is %s with 409',
      async (status) => {
        const h = build();
        const request = h.requestOf(status);

        await expect(
          h.prefill.trigger({ requestId: request.id }, SALES),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(h.fx.aiRuns.rows).toHaveLength(0);
      },
    );

    it('refuses a request that already has a manual estimate', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      await h.fx.service.create({ requestId: request.id }, ENGINEER);
      // Back to draft would be unreachable; the estimate alone must already stop the run.
      request.status = RequestStatus.DRAFT;

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets exactly one of two simultaneous triggers through', async () => {
      const h = build();
      const request = h.requestOf();

      const results = await Promise.allSettled([
        h.prefill.trigger({ requestId: request.id }, SALES),
        h.prefill.trigger({ requestId: request.id }, SALES),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(ConflictException);
      expect(h.fx.aiRuns.rows).toHaveLength(1);
      expect(h.queue.add).toHaveBeenCalledTimes(1);
    });

    it('refuses a request with neither attachment nor requirements', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED, {
        technicalRequirements: '  ',
      });

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('accepts an empty requirement text when a file is attached', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED, {
        technicalRequirements: null,
      });
      h.fx.attachments.seed({
        requestId: request.id,
        storageKey: 'k/brief.pdf',
        fileName: 'brief.pdf',
        contentType: 'application/pdf',
        sizeBytes: 8,
        createdAt: new Date(),
      });

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).resolves.toBeDefined();
    });

    it('answers 503 without a key, before any run or job exists', async () => {
      const h = build({ apiKey: undefined });
      const request = h.requestOf();

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(h.fx.aiRuns.rows).toHaveLength(0);
      expect(h.queue.add).not.toHaveBeenCalled();
    });

    it('answers 429 once the user has 20 runs in a day', async () => {
      const h = build();
      const request = h.requestOf();
      for (let i = 0; i < 20; i++) {
        h.fx.aiRuns.seed({
          requestId: 900 + i,
          status: 'failed' as never,
          createdBy: SALES.userId,
          createdAt: new Date(),
        } as never);
      }

      const error: unknown = await h.prefill
        .trigger({ requestId: request.id }, SALES)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    });

    it('answers 409 when the catalog is too large for one prompt', async () => {
      const h = build();
      const request = h.requestOf();
      h.setCatalogCount(3001);

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toThrow('Catalog too large for AI run');
    });
  });

  describe('reading a run', () => {
    it('shows the run to the request owner', async () => {
      const h = build();
      const request = h.requestOf();
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      const runId = await runFor(h, request);

      await expect(h.prefill.getRun(runId, SALES)).resolves.toEqual({
        status: 'succeeded',
        error: null,
        estimateId: h.fx.estimates.rows[0].id,
        summary: expect.stringContaining('MSB') as string,
      });
    });

    it('answers 404 to another sales owner and to an engineer outside the request', async () => {
      const h = build();
      const request = h.requestOf();
      const { runId } = await h.prefill.trigger(
        { requestId: request.id },
        SALES,
      );

      await expect(h.prefill.getRun(runId, OTHER_SALES)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        h.prefill.getRun(runId, OTHER_ENGINEER),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.prefill.getRun(9999, SALES)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers 403 to the administrator even though the scope reaches the request', async () => {
      const h = build();
      const request = h.requestOf();
      const { runId } = await h.prefill.trigger(
        { requestId: request.id },
        SALES,
      );

      await expect(h.prefill.getRun(runId, ADMIN)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('writing the draft', () => {
    it('writes the draft, flags it AI, prices lines at the reference price and advances the request', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      const items = h.catalog(2);
      h.client.extract.mockResolvedValue(h.output(items));

      const runId = await runFor(h, request);

      expect(h.fx.estimates.rows).toHaveLength(1);
      const estimate = h.fx.estimates.rows[0];
      expect(estimate).toMatchObject({
        requestId: request.id,
        createdBy: SALES.userId,
        status: 'draft',
        latestRevision: 1,
      });
      expect(estimate.total).toBeGreaterThan(0);
      expect(h.fx.revisions.rows).toMatchObject([
        { estimateId: estimate.id, revision: 1, status: 'draft' },
      ]);
      expect(h.fx.panels.rows).toMatchObject([
        {
          tag: 'MSB-01',
          quantity: 2,
          isAiGenerated: true,
          aiNote: 'Từ bản vẽ',
        },
      ]);
      expect(h.fx.bomLines.rows).toHaveLength(2);
      expect(h.fx.bomLines.rows[0]).toMatchObject({
        itemId: items[0].id,
        quantity: 1,
        unitCost: 1000,
        isAiGenerated: true,
        isVerified: false,
        aiConfidence: 0.9,
      });
      expect(h.fx.bomLines.rows[1].unitCost).toBe(2000);
      expect(statusOf(h, request.id)).toBe(RequestStatus.ESTIMATING);
      expect(runRow(h, runId)).toMatchObject({
        status: 'succeeded',
        estimateId: estimate.id,
      });
      expect(runRow(h, runId).summary).toContain('MSB');
      expect(h.fx.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ESTIMATE_AI_FILLED_EVENT,
          userIds: expect.arrayContaining([
            SALES.userId,
            ENGINEER.userId,
          ]) as number[],
        }),
      );
    });

    it('leaves a draft request in draft', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.DRAFT);
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));

      await runFor(h, request);

      expect(h.fx.estimates.rows).toHaveLength(1);
      expect(statusOf(h, request.id)).toBe(RequestStatus.DRAFT);
    });

    it('fills empty requirements and appends to existing text under [AI], within 10000 characters', async () => {
      const h = build();
      const empty = h.requestOf(RequestStatus.ASSIGNED, {
        technicalRequirements: null,
      });
      h.fx.attachments.seed({
        requestId: empty.id,
        storageKey: 'k/a.pdf',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 8,
        createdAt: new Date(),
      });
      const full = h.requestOf(RequestStatus.ASSIGNED, {
        technicalRequirements: 'x'.repeat(9_990),
      });
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));

      await runFor(h, empty);
      await runFor(h, full);

      expect(empty.technicalRequirements).toBe('[AI] Tủ MSB 3 pha');
      const text = full.technicalRequirements as string;
      expect(text.startsWith('x'.repeat(9_990))).toBe(true);
      expect(text.length).toBeLessThanOrEqual(10_000);
      expect(text.slice(9_990)).toMatch(/^\n\n\[AI\] /);

      const short = h.requestOf(RequestStatus.ASSIGNED, {
        technicalRequirements: 'Ghi chú của Sales',
      });
      await runFor(h, short);
      expect(short.technicalRequirements).toBe(
        'Ghi chú của Sales\n\n[AI] Tủ MSB 3 pha',
      );
    });
  });

  describe('failure and races', () => {
    const expectNothingWritten = (h: Harness) => {
      expect(h.fx.estimates.rows).toHaveLength(0);
      expect(h.fx.revisions.rows).toHaveLength(0);
      expect(h.fx.panels.rows).toHaveLength(0);
      expect(h.fx.bomLines.rows).toHaveLength(0);
    };

    it('stores the typed code of an AI failure and tells the user', async () => {
      const h = build();
      const request = h.requestOf();
      h.client.extract.mockRejectedValue(new AiRateLimitedError());

      const runId = await runFor(h, request);

      expectNothingWritten(h);
      expect(runRow(h, runId)).toMatchObject({ status: 'failed' });
      expect(runRow(h, runId).error).toMatch(/^AI_RATE_LIMITED/);
      expect(h.fx.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: ESTIMATE_AI_FAILED_EVENT }),
      );
    });

    it('never stores what a storage error says', async () => {
      const h = build();
      const request = h.requestOf();
      h.fx.attachments.seed({
        requestId: request.id,
        storageKey: 'k/a.pdf',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 8,
        createdAt: new Date(),
      });
      h.storage.getObjectBuffer.mockRejectedValue(
        new Error('AccessDenied AKIAIOSFODNN7EXAMPLE bucket erp-private'),
      );

      const runId = await runFor(h, request);

      const stored = runRow(h, runId).error as string;
      expect(stored).toMatch(/^AI_INTERNAL/);
      expect(stored).not.toMatch(/AKIA|bucket|AccessDenied/);
      expectNothingWritten(h);
    });

    it('fails the run on output that breaks the schema', async () => {
      const h = build();
      const request = h.requestOf();
      h.client.extract.mockResolvedValue({ panels: 'nope' });

      const runId = await runFor(h, request);

      expect(runRow(h, runId).error).toMatch(/^AI_OUTPUT_INVALID/);
      expectNothingWritten(h);
    });

    it('rolls everything back when the database fails in the middle', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      h.client.extract.mockResolvedValue(h.output(h.catalog(2)));
      h.fx.bomLines.save.mockRejectedValueOnce(new Error('connection lost'));

      const runId = await runFor(h, request);

      expectNothingWritten(h);
      expect(statusOf(h, request.id)).toBe(RequestStatus.ASSIGNED);
      expect(runRow(h, runId)).toMatchObject({ status: 'failed' });
      expect(runRow(h, runId).error).toMatch(/^AI_INTERNAL/);
      expect(runRow(h, runId).error).not.toContain('connection lost');
    });

    it('writes nothing when the request status cannot advance, and keeps the request as it was', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      jest
        .spyOn(h.fx.statusPort, 'advance')
        .mockRejectedValue(new ConflictException('nope'));

      const runId = await runFor(h, request);

      expectNothingWritten(h);
      expect(statusOf(h, request.id)).toBe(RequestStatus.ASSIGNED);
      expect(runRow(h, runId).status).toBe('failed');
    });

    it.each([
      [
        'cancelled',
        (r: { status: RequestStatus }) => (r.status = RequestStatus.CANCELLED),
      ],
      ['deleted', (r: { isDeleted: boolean }) => (r.isDeleted = true)],
    ])(
      'writes nothing when the request is %s during the run',
      async (_n, f) => {
        const h = build();
        const request = h.requestOf();
        const items = h.catalog(1);
        h.client.extract.mockImplementation(() => {
          f(request);
          return Promise.resolve(h.output(items));
        });

        const runId = await runFor(h, request);

        expectNothingWritten(h);
        expect(runRow(h, runId).status).toBe('failed');
        expect(runRow(h, runId).error).toMatch(/^AI_REQUEST_CHANGED/);
        expect(h.fx.notifications.emit).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: ESTIMATE_AI_FAILED_EVENT }),
        );
      },
    );

    it('writes nothing when the engineer made an estimate by hand first', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      const items = h.catalog(1);
      h.client.extract.mockImplementation(async () => {
        await h.fx.service.create({ requestId: request.id }, ENGINEER);
        return h.output(items);
      });

      const runId = await runFor(h, request);

      // Only the engineer's own empty draft exists, none of the AI rows.
      expect(h.fx.estimates.rows).toHaveLength(1);
      expect(h.fx.estimates.rows[0].createdBy).toBe(ENGINEER.userId);
      expect(h.fx.panels.rows).toHaveLength(0);
      expect(runRow(h, runId).status).toBe('failed');
    });

    it('drops a line whose item was deleted before the writer and says so', async () => {
      const h = build();
      const request = h.requestOf();
      const [kept, gone] = h.catalog(2);
      h.client.extract.mockImplementation(() => {
        gone.isDeleted = true;
        return Promise.resolve(h.output([kept, gone]));
      });

      const runId = await runFor(h, request);

      expect(runRow(h, runId).status).toBe('succeeded');
      expect(h.fx.bomLines.rows).toHaveLength(1);
      expect(h.fx.bomLines.rows[0].itemId).toBe(kept.id);
      expect(h.fx.panels.rows[0].aiNote).toContain(`#${gone.id}`);
    });

    it('writes no estimate when every item is gone', async () => {
      const h = build();
      const request = h.requestOf();
      const [only] = h.catalog(1);
      h.client.extract.mockImplementation(() => {
        only.isDeleted = true;
        return Promise.resolve(h.output([only]));
      });

      const runId = await runFor(h, request);

      expectNothingWritten(h);
      expect(runRow(h, runId).status).toBe('failed');
    });

    it('keeps the run succeeded when the notification throws after the commit', async () => {
      const h = build();
      const request = h.requestOf();
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      h.fx.notifications.emit.mockRejectedValue(new Error('bell down'));

      const runId = await runFor(h, request);

      expect(runRow(h, runId).status).toBe('succeeded');
      expect(h.fx.estimates.rows).toHaveLength(1);
    });

    it('does not call the AI for a run the sweeper already failed', async () => {
      const h = build();
      const request = h.requestOf();
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      const { runId } = await h.prefill.trigger(
        { requestId: request.id },
        SALES,
      );
      runRow(h, runId).status = 'failed' as never;

      await h.drain();

      expect(h.client.extract).not.toHaveBeenCalled();
      expect(runRow(h, runId).status).toBe('failed');
      expect(h.fx.estimates.rows).toHaveLength(0);
    });

    it('does not run a job twice', async () => {
      const h = build();
      const request = h.requestOf();
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      const runId = await runFor(h, request);

      await h.prefill.execute(runId);

      expect(h.client.extract).toHaveBeenCalledTimes(1);
    });
  });

  describe('items the model made up', () => {
    it('drops an unknown id, names the reason and creates no item', async () => {
      const h = build();
      const request = h.requestOf();
      const [real] = h.catalog(1);
      const before = h.fx.items.rows.length;
      h.client.extract.mockResolvedValue(
        h.output([real, { id: 987_654 }, { id: 987_655 }]),
      );

      await runFor(h, request);

      expect(h.fx.bomLines.rows.map((l) => l.itemId)).toEqual([real.id]);
      expect(h.fx.panels.rows[0].aiNote).toContain('#987654');
      expect(h.fx.panels.rows[0].aiNote).toContain('không có trong danh mục');
      expect(h.fx.items.rows).toHaveLength(before);
    });
  });

  describe('re-running', () => {
    it('replaces an AI draft nobody has verified while the request is draft', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.DRAFT);
      const items = h.catalog(2);
      h.client.extract.mockResolvedValue(h.output(items));
      await runFor(h, request);
      const firstId = h.fx.estimates.rows[0].id;
      h.client.extract.mockResolvedValue(
        h.output([items[1]], {
          panels: [
            {
              tag: 'ATS-01',
              description: 'Tủ ATS',
              quantity: 1,
              aiNote: '',
              rows: [
                {
                  where: 'Tủ ATS',
                  text: 'Vật tư',
                  quantity: 4,
                  itemId: items[1].id,
                  confidence: 0.7,
                  note: '',
                },
              ],
            },
          ],
        }),
      );

      const runId = await runFor(h, request);

      expect(runRow(h, runId).status).toBe('succeeded');
      expect(h.fx.estimates.rows).toHaveLength(1);
      expect(h.fx.estimates.rows[0].id).toBe(firstId);
      expect(h.fx.revisions.rows).toHaveLength(1);
      expect(h.fx.panels.rows.map((p) => p.tag)).toEqual(['ATS-01']);
      expect(h.fx.bomLines.rows).toHaveLength(1);
      expect(statusOf(h, request.id)).toBe(RequestStatus.DRAFT);
    });

    it.each([
      ['Ghi chú của Sales', 'Ghi chú của Sales\n\n[AI] Lần hai'],
      [null, '[AI] Lần hai'],
    ])(
      'keeps one AI block in the requirements after a re-run (Sales text %p)',
      async (salesText, expected) => {
        const h = build();
        const request = h.requestOf(RequestStatus.DRAFT, {
          technicalRequirements: salesText,
        });
        h.fx.attachments.seed({
          requestId: request.id,
          storageKey: 'k/a.pdf',
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          sizeBytes: 8,
          createdAt: new Date(),
        });
        const items = h.catalog(1);
        h.client.extract.mockResolvedValueOnce(
          h.output(items, { requirementsSummary: 'Lần một' }),
        );
        h.client.extract.mockResolvedValueOnce(
          h.output(items, { requirementsSummary: 'Lần hai' }),
        );

        await runFor(h, request);
        await runFor(h, request);

        expect(request.technicalRequirements).toBe(expected);
        expect(request.technicalRequirements?.match(/\[AI\] /g)).toHaveLength(
          1,
        );
      },
    );

    it('keeps the requirements within 10000 characters across a re-run', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.DRAFT, {
        technicalRequirements: 'x'.repeat(9_900),
      });
      h.client.extract.mockResolvedValue(
        h.output(h.catalog(1), { requirementsSummary: 'y'.repeat(500) }),
      );

      await runFor(h, request);
      await runFor(h, request);

      const text = request.technicalRequirements as string;
      expect(text.length).toBeLessThanOrEqual(10_000);
      expect(text.startsWith('x'.repeat(9_900))).toBe(true);
      expect(text.match(/\[AI\] /g)).toHaveLength(1);
    });

    it('refuses once a line is verified', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.DRAFT);
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      await runFor(h, request);
      h.fx.bomLines.rows[0].isVerified = true;

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses when the request is no longer draft', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      await runFor(h, request);
      request.status = RequestStatus.ASSIGNED;

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses when a panel or line was added by hand', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.DRAFT);
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      await runFor(h, request);
      h.fx.panels.rows[0].isAiGenerated = false;

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('who may edit the draft', () => {
    const filled = async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      h.client.extract.mockResolvedValue(h.output(h.catalog(2)));
      await runFor(h, request);
      return { h, estimateId: h.fx.estimates.rows[0].id };
    };

    it('grants Sales the AI action and none of the estimate write scopes', () => {
      for (const role of ['sales', 'salesManager']) {
        const granted = seededRolePermissions(role) ?? [];
        expect(granted).toContain('estimate:ai_prefill');
        expect(granted).not.toContain('estimate:create');
        expect(granted).not.toContain('estimate:update');
        expect(granted).not.toContain('estimate:submit');
      }
      expect(seededRolePermissions('engineer')).not.toContain(
        'estimate:ai_prefill',
      );
    });

    it('refuses every Sales edit, verify and submit of the draft', async () => {
      const { h, estimateId } = await filled();
      const panelId = h.fx.panels.rows[0].id;
      const lineId = h.fx.bomLines.rows[0].id;
      const item = h.fx.itemOf();

      for (const attempt of [
        () =>
          h.fx.editor.addPanel(estimateId, { tag: 'X', quantity: 1 }, SALES),
        () => h.fx.editor.updatePanel(estimateId, panelId, { tag: 'Y' }, SALES),
        () => h.fx.editor.deletePanel(estimateId, panelId, SALES),
        () =>
          h.fx.editor.addBomLine(
            estimateId,
            panelId,
            { itemId: item.id, quantity: 1 },
            SALES,
          ),
        () => h.fx.editor.deleteBomLine(estimateId, lineId, SALES),
        () => h.fx.verify.verifyBomLine(estimateId, lineId, SALES),
        () => h.fx.verify.verifyAll(estimateId, SALES),
        () => h.fx.service.submit(estimateId, SALES),
        () => h.fx.service.revise(estimateId, SALES),
      ]) {
        await expect(attempt()).rejects.toBeInstanceOf(NotFoundException);
      }
    });

    it('lets the assigned engineer edit, verify and submit, without a money key', async () => {
      const { h, estimateId } = await filled();
      const panelId = h.fx.panels.rows[0].id;

      const edited = await h.fx.editor.updatePanel(
        estimateId,
        panelId,
        { quantity: 3 },
        ENGINEER,
      );
      expectNoMoneyKeys(edited);
      expect(edited.unverifiedAiCount).toBe(2);

      const verified = await h.fx.verify.verifyAll(estimateId, ENGINEER);
      expectNoMoneyKeys(verified);
      expect(verified.unverifiedAiCount).toBe(0);

      const submitted = await h.fx.service.submit(estimateId, ENGINEER);
      expectNoMoneyKeys(submitted);
      expect(submitted.current.status).toBe('submitted');
    });
  });

  describe('no money in AI text', () => {
    it('leaves no amount on any path an engineer can read', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      const items = h.catalog(2);
      h.client.extract.mockResolvedValue({
        requirementsSummary: `Tủ MSB 3 pha\n${MONEY_TEXT}`,
        panels: [
          {
            tag: 'MSB-01',
            description: `Tủ chính ${MONEY_TEXT}`,
            quantity: 1,
            aiNote: `Từ bản vẽ\n${MONEY_TEXT}`,
            rows: [
              ...items.map((item) => ({
                where: `Nhánh ${MONEY_TEXT}`,
                text: 'Vật tư',
                quantity: 1,
                itemId: item.id,
                confidence: 0.8,
                note: `khớp\n${MONEY_TEXT}`,
              })),
              {
                where: 'Tủ chính',
                text: `Đèn lạ ${MONEY_TEXT}`,
                quantity: 1,
                itemId: null,
                confidence: 0.4,
                note: MONEY_TEXT,
              },
            ],
          },
        ],
      });

      const runId = await runFor(h, request);

      expect(runRow(h, runId).status).toBe('succeeded');
      for (const text of stringsOf(h)) expect(text).not.toMatch(MONEY);
      const asEngineer = await h.fx.service.findOne(
        h.fx.estimates.rows[0].id,
        ENGINEER,
      );
      expect(JSON.stringify(asEngineer)).not.toMatch(MONEY);
      expect(JSON.stringify(await h.prefill.getRun(runId, SALES))).not.toMatch(
        MONEY,
      );
    });

    it('the writer redacts a draft that reaches it unredacted', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED);
      const [item] = h.catalog(1);
      const run = h.fx.aiRuns.seed({
        requestId: request.id,
        status: 'running' as never,
        createdBy: SALES.userId,
      } as never);

      await h.writer.write({
        runId: run.id,
        requestId: request.id,
        actorId: SALES.userId,
        draft: {
          requirementsSummary: MONEY_TEXT,
          panels: [
            {
              tag: 'MSB',
              description: MONEY_TEXT,
              quantity: 1,
              aiNote: MONEY_TEXT,
              lines: [
                {
                  itemId: item.id,
                  quantity: 1,
                  confidence: 1,
                  note: MONEY_TEXT,
                },
              ],
            },
          ],
          unmatched: [{ description: MONEY_TEXT, reason: MONEY_TEXT }],
        },
        skipped: [
          { fileName: 'Báo giá 85.000.000đ.pdf', reason: MONEY_TEXT },
          { fileName: 'Tổng 1.200.000 VND.xlsx', reason: 'không đọc được' },
        ],
      });

      for (const text of stringsOf(h)) expect(text).not.toMatch(MONEY);
      expect(runRow(h, run.id).summary).not.toMatch(MONEY);
    });
  });

  describe('run lifecycle', () => {
    it('fails a run stuck for more than ten minutes and frees the request', async () => {
      const h = build();
      const request = h.requestOf();
      const stale = h.fx.aiRuns.seed({
        requestId: request.id,
        status: 'running' as never,
        createdBy: SALES.userId,
        createdAt: new Date(Date.now() - 11 * 60_000),
      } as never);
      const fresh = h.fx.aiRuns.seed({
        requestId: request.id + 100,
        status: 'queued' as never,
        createdBy: SALES.userId,
        createdAt: new Date(Date.now() - 5 * 60_000),
      } as never);

      await h.sweeper.sweep();

      expect(stale.status).toBe('failed');
      expect(stale.error).toMatch(/^AI_TIMEOUT/);
      expect(fresh.status).toBe('queued');
      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).resolves.toBeDefined();
    });

    it('fails the run when the job cannot be queued, and the request can be tried again', async () => {
      const h = build();
      const request = h.requestOf();
      h.queue.add.mockRejectedValueOnce(new Error('redis://secret@host down'));

      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      const [run] = h.fx.aiRuns.rows;
      expect(run.status).toBe('failed');
      expect(run.error).toMatch(/^AI_INTERNAL/);
      expect(run.error).not.toContain('secret');
      await expect(
        h.prefill.trigger({ requestId: request.id }, SALES),
      ).resolves.toBeDefined();
    });

    it('does not let a late job overwrite a run the sweeper already failed', async () => {
      const h = build();
      const request = h.requestOf();
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));
      const { runId } = await h.prefill.trigger(
        { requestId: request.id },
        SALES,
      );
      h.client.extract.mockImplementation(() => {
        runRow(h, runId).status = 'failed' as never;
        return Promise.resolve(h.output(h.catalog(1)));
      });

      await h.drain();

      expect(h.fx.estimates.rows).toHaveLength(0);
    });

    it('registers the queue so a stalled job is failed, never run again', () => {
      expect(ESTIMATE_AI_QUEUE_SETTINGS.maxStalledCount).toBe(0);
      const imports = Reflect.getMetadata('imports', EstimateModule) as Array<{
        providers?: Array<{
          provide?: unknown;
          useFactory?: (holder: unknown) => {
            settings?: { maxStalledCount?: number };
          };
        }>;
      }>;
      const options = imports
        .flatMap((entry) => entry.providers ?? [])
        .find(
          (provider) =>
            provider.provide === getQueueOptionsToken(ESTIMATE_AI_QUEUE),
        )
        ?.useFactory?.({ getDependencyRef: () => undefined });
      expect(options?.settings?.maxStalledCount).toBe(0);
      expect(ESTIMATE_AI_QUEUE).toBe('estimate-ai');
    });

    it('hands the job to the service from the processor', async () => {
      const h = build();
      const execute = jest.spyOn(h.prefill, 'execute').mockResolvedValue();

      await new EstimateAiPrefillProcessor(h.prefill).handle({
        data: { runId: 7 },
      } as never);

      expect(execute).toHaveBeenCalledWith(7);
    });
  });

  describe('template', () => {
    // The system prompt names the tags too; only the content blocks carry data.
    const promptText = (h: Harness): string =>
      JSON.stringify(h.client.extract.mock.calls[0]?.[0].content);

    it('puts the project template panels and lines in the prompt', async () => {
      const h = build();
      const [a] = h.catalog(1);
      const request = h.requestOf(RequestStatus.ASSIGNED, { projectId: 5 });
      h.setTemplateRows([
        {
          panel_id: 1,
          tag: 'TPL-TU-LO-HOI',
          description: 'Tủ lò hơi',
          panel_quantity: 1,
          item_id: a.id,
          line_quantity: '2.000',
          group_label: 'Bảo vệ',
          note: null,
        },
      ]);
      h.client.extract.mockResolvedValue(h.output([a]));

      await runFor(h, request);

      expect(promptText(h)).toContain('<template>');
      expect(promptText(h)).toContain('TPL-TU-LO-HOI');
      expect(promptText(h)).toContain('Bảo vệ');
    });

    it('runs without a template section when the project has none', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED, { projectId: 5 });
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));

      await runFor(h, request);

      expect(promptText(h)).not.toContain('<template>');
      expect(h.fx.estimates.rows).toHaveLength(1);
    });

    it('asks only for a template that is live and active', async () => {
      const h = build();
      const request = h.requestOf(RequestStatus.ASSIGNED, { projectId: 5 });
      h.client.extract.mockResolvedValue(h.output(h.catalog(1)));

      await runFor(h, request);

      const sql = h.fx.manager.query.mock.calls
        .map((call) => String(call[0]))
        .find((text) => text.includes('quotation_templates')) as string;
      expect(sql).toContain('is_deleted = false');
      expect(sql).toContain('is_active = true');
      expect(sql).toContain('projects');
    });
  });

  describe('wiring', () => {
    const meta = (key: string, target: object) =>
      Reflect.getMetadata(key, target) as unknown;
    // Handlers read as plain objects: only their decorator metadata is inspected.
    const proto = EstimateAiController.prototype as unknown as Record<
      'trigger' | 'getRun',
      object
    >;

    it('runs the sweeper every minute', () => {
      expect(
        meta(
          'SCHEDULE_CRON_OPTIONS',
          (EstimateAiSweeperService.prototype as unknown as { sweep: object })
            .sweep,
        ),
      ).toMatchObject({ cronTime: CronExpression.EVERY_MINUTE });
    });

    it('serves the AI routes under their path with the permission, 202 and throttle', () => {
      expect(meta('path', EstimateAiController)).toBe(
        'sales/estimates/ai-prefill',
      );
      expect(meta('path', proto.getRun)).toBe(':runId');
      expect(meta('permissions', proto.trigger)).toEqual([ESTIMATE_AI_PREFILL]);
      expect(meta('permissions', proto.getRun)).toEqual([ESTIMATE_AI_PREFILL]);
      expect(meta('__httpCode__', proto.trigger)).toBe(202);
      expect(meta('THROTTLER:LIMITdefault', proto.trigger)).toBe(5);
      expect(meta('THROTTLER:TTLdefault', proto.trigger)).toBe(60_000);
    });

    it('registers the controller, processor, sweeper, services and AI providers in the module', () => {
      expect(meta('controllers', EstimateModule)).toContain(
        EstimateAiController,
      );
      const providers = meta('providers', EstimateModule) as unknown[];
      for (const provider of [
        EstimateAiPrefillService,
        EstimateAiWriterService,
        EstimateAiSweeperService,
        EstimateAiPrefillProcessor,
      ]) {
        expect(providers).toContain(provider);
      }
      const tokens = providers.map((p) => (p as { provide?: unknown }).provide);
      expect(tokens).toEqual(
        expect.arrayContaining([ESTIMATE_AI_SETTINGS, ESTIMATE_AI_CLIENT]),
      );
    });
  });
});
