import { InjectQueue } from '@nestjs/bull';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { DataScopeService } from '@shared/services/data-scope.service';
import { S3StorageService } from '@shared/services/s3-storage.service';
import { isUniqueViolationOn } from '@shared/utils/db-error.util';

import { AiInternalError, AiError } from '@plugins/sales/estimate/ai/ai-errors';
import { extractEstimateDraft } from '@plugins/sales/estimate/ai/extract-estimate-draft';
import {
  MAX_CATALOG_ITEMS,
  type CatalogItem,
  type PrefillTemplate,
} from '@plugins/sales/estimate/ai/prefill-prompt.builder';
import {
  ESTIMATE_AI_CLIENT,
  ESTIMATE_AI_DAILY_RUN_CAP,
  ESTIMATE_AI_FAILED_EVENT,
  ESTIMATE_AI_FILLED_EVENT,
  ESTIMATE_AI_JOB,
  ESTIMATE_AI_QUEUE,
  ESTIMATE_AI_ROLES,
  ESTIMATE_AI_SETTINGS,
  MAX_RUN_ERROR_LENGTH,
} from '@plugins/sales/estimate/constants/estimate-ai.constant';
import { EstimateAiRun } from '@plugins/sales/estimate/entities/estimate-ai-run.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateAiRunStatus } from '@plugins/sales/estimate/enums/estimate-ai-run-status.enum';
import { ESTIMATE_READ } from '@plugins/sales/estimate/permissions/estimate.permissions';
import {
  EstimateAiRequestChangedError,
  EstimateAiWriterService,
  isReplaceableAiDraft,
  type EstimateAiWriteResult,
} from '@plugins/sales/estimate/services/estimate-ai-writer.service';
import { SalesRequestAttachment } from '@plugins/sales/request/entities/request-attachment.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import { REQUEST_READ } from '@plugins/sales/request/permissions/request.permissions';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { AiSettings } from '@kernel/core/config/ai-provider.config';
import type { AiClient } from '@plugins/sales/estimate/ai/ai-client.port';
import type { AiPrefillDto } from '@plugins/sales/estimate/dto/ai-prefill.dto';
import type { Queue } from 'bull';
import type { EntityManager } from 'typeorm';

const REQUEST_LABEL = 'Request';
export const ACTIVE_RUN_INDEX = 'uq_sales_estimate_ai_runs_active';
const ACTIVE_STATUSES: readonly EstimateAiRunStatus[] = [
  EstimateAiRunStatus.QUEUED,
  EstimateAiRunStatus.RUNNING,
];
const TRIGGER_STATUSES: readonly RequestStatus[] = [
  RequestStatus.DRAFT,
  RequestStatus.ASSIGNED,
];

/** Takes a queued run for this worker; no row back means it was failed or taken meanwhile. */
export const CLAIM_RUN_SQL = `UPDATE sales_estimate_ai_runs SET status = 'running', updated_at = now()
  WHERE id = $1 AND status = 'queued' RETURNING id`;

/** Runs one user started in the last rolling day, failed ones included. */
export const DAILY_RUN_COUNT_SQL = `SELECT COUNT(*)::int AS n FROM sales_estimate_ai_runs
  WHERE created_by = $1 AND created_at > now() - interval '1 day'`;

/** The panels and lines of the project's template, only while that template is live and active. */
export const TEMPLATE_SQL = `SELECT p.id AS panel_id, p.tag, p.description, p.quantity AS panel_quantity,
       l.item_id, l.quantity AS line_quantity, l.group_label, l.note
  FROM projects pr
  JOIN quotation_templates t ON t.id = pr.quotation_template_id
    AND t.is_deleted = false AND t.is_active = true
  JOIN quotation_template_panels p ON p.template_id = t.id
  LEFT JOIN quotation_template_lines l ON l.panel_id = p.id
  WHERE pr.id = $1 AND pr.is_deleted = false
  ORDER BY p.id, l.id`;

/** The text a failed run keeps: a stable code and its fixed sentence, never upstream text. */
export function runErrorText(error: AiError): string {
  return `${error.code}: ${error.message}`.slice(0, MAX_RUN_ERROR_LENGTH);
}

export interface EstimateAiRunView {
  status: EstimateAiRunStatus;
  error: string | null;
  estimateId: number | null;
  summary: string | null;
}

interface TemplateRow {
  panel_id: number;
  tag: string;
  description: string | null;
  panel_quantity: number;
  item_id: number | null;
  line_quantity: string | number | null;
  group_label: string | null;
  note: string | null;
}

@Injectable()
export class EstimateAiPrefillService {
  private readonly logger = new Logger(EstimateAiPrefillService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    @InjectQueue(ESTIMATE_AI_QUEUE)
    private readonly queue: Queue<{ runId: number }>,
    @Inject(ESTIMATE_AI_SETTINGS) private readonly settings: AiSettings,
    @Inject(ESTIMATE_AI_CLIENT) private readonly client: AiClient,
    private readonly storage: S3StorageService,
    private readonly writer: EstimateAiWriterService,
    private readonly notifications: NotificationService,
  ) {}

  /** Checks everything that can be checked now, records a queued run and hands it to the queue. */
  async trigger(
    dto: AiPrefillDto,
    actor: AuthUserPayload,
  ): Promise<{ runId: number }> {
    this.assertRole(actor);
    if (!this.settings.apiKey) {
      throw new ServiceUnavailableException('AI is not configured');
    }
    const manager = this.dataSource.manager;
    const request = this.dataScope.assertVisible(
      actor,
      await manager
        .getRepository(SalesRequest)
        .findOne({ where: { id: dto.requestId, isDeleted: false } }),
      REQUEST_LABEL,
    );
    await this.assertEligible(manager, request);
    await this.assertWithinDailyCap(manager, actor.userId);

    const runRepo = manager.getRepository(EstimateAiRun);
    let run: EstimateAiRun;
    try {
      run = await runRepo.save(
        runRepo.create({
          requestId: request.id,
          status: EstimateAiRunStatus.QUEUED,
          createdBy: actor.userId,
        }),
      );
    } catch (error: unknown) {
      if (isUniqueViolationOn(error, [ACTIVE_RUN_INDEX])) {
        throw new ConflictException(
          'An AI run is already in progress for this request.',
        );
      }
      throw error;
    }

    try {
      await this.queue.add(
        ESTIMATE_AI_JOB,
        { runId: run.id },
        { attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
    } catch {
      // The queue's error text can carry the Redis address; only the run id is logged.
      this.logger.error(`AI run ${run.id} could not be queued`);
      await this.markFailed(run.id, new AiInternalError());
      throw new ServiceUnavailableException('Could not queue the AI run');
    }
    return { runId: run.id };
  }

  /** A run, to the actor whose scope reaches its request and who may use the AI action. */
  async getRun(
    runId: number,
    actor: AuthUserPayload,
  ): Promise<EstimateAiRunView> {
    const manager = this.dataSource.manager;
    const run = await manager
      .getRepository(EstimateAiRun)
      .findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('AI run not found');
    // Scope first: a caller outside it learns nothing, not even that the role is refused.
    this.dataScope.assertVisible(
      actor,
      await manager
        .getRepository(SalesRequest)
        .findOne({ where: { id: run.requestId, isDeleted: false } }),
      'AI run',
    );
    this.assertRole(actor);
    return {
      status: run.status,
      error: run.error ?? null,
      estimateId: run.estimateId ?? null,
      summary: run.summary ?? null,
    };
  }

  /** The queue's job: runs once, and every outcome ends in `succeeded` or `failed`. */
  async execute(runId: number): Promise<void> {
    const runRepo = this.dataSource.manager.getRepository(EstimateAiRun);
    // Atomic claim: a run the sweeper already failed (or another worker took) is not claimed,
    // so the AI is never called for it.
    const [claimed]: [Array<{ id: number }>, number] =
      await this.dataSource.manager.query(CLAIM_RUN_SQL, [runId]);
    if (claimed.length === 0) return;
    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run) return;

    let result: EstimateAiWriteResult;
    try {
      const request = await this.dataSource.manager
        .getRepository(SalesRequest)
        .findOne({ where: { id: run.requestId, isDeleted: false } });
      if (!request || !TRIGGER_STATUSES.includes(request.status)) {
        throw new EstimateAiRequestChangedError();
      }
      const { draft, skipped } = await extractEstimateDraft(
        await this.inputOf(request),
        this.client,
      );
      result = await this.writer.write({
        runId,
        requestId: request.id,
        actorId: run.createdBy,
        draft,
        skipped,
      });
    } catch (error: unknown) {
      // Anything that is not already a typed AI error (storage, database) becomes a generic one.
      const typed = error instanceof AiError ? error : new AiInternalError();
      this.logger.warn(
        `AI run ${runId} failed: ${typed.code}${typed === error ? '' : ` (${error instanceof Error ? error.name : 'unknown'})`}`,
      );
      if (await this.markFailed(runId, typed)) {
        await this.notifyFailed(run.requestId, run.createdBy, typed);
      }
      return;
    }
    await this.notifyFilled(result, runId, run.createdBy);
  }

  /** Tells the person who started a run, and the engineer on the request, that it failed. */
  async notifyFailed(
    requestId: number,
    actorId: number,
    error: AiError,
  ): Promise<void> {
    try {
      const request = await this.dataSource.manager
        .getRepository(SalesRequest)
        .findOne({ where: { id: requestId } });
      await this.notifications.emit({
        eventType: ESTIMATE_AI_FAILED_EVENT,
        roleCodes: [],
        userIds: this.recipients(actorId, request?.assignedEngineerId),
        message: `${request?.code ?? requestId} — ${error.message}`,
        requiredScope: REQUEST_READ,
        link: `/sales/requests/${requestId}`,
        payload: {
          requestId,
          requestCode: request?.code ?? null,
          code: error.code,
        },
        createdBy: actorId,
      });
    } catch (cause: unknown) {
      this.logger.error(
        `Could not notify the AI failure of request ${requestId}`,
        cause instanceof Error ? cause.stack : String(cause),
      );
    }
  }

  /** After the commit, and swallowed: a failed notice must not undo a finished draft. */
  private async notifyFilled(
    { estimate, request }: EstimateAiWriteResult,
    runId: number,
    actorId: number,
  ): Promise<void> {
    try {
      await this.notifications.emit({
        eventType: ESTIMATE_AI_FILLED_EVENT,
        roleCodes: [],
        userIds: this.recipients(actorId, request.assignedEngineerId),
        message: `${estimate.code} — ${request.code}`,
        requiredScope: ESTIMATE_READ,
        link: `/sales/estimates/${estimate.id}`,
        payload: {
          runId,
          estimateId: estimate.id,
          code: estimate.code,
          requestId: request.id,
          requestCode: request.code,
        },
        createdBy: actorId,
      });
    } catch (cause: unknown) {
      this.logger.error(
        `Could not notify the AI draft ${estimate.code}`,
        cause instanceof Error ? cause.stack : String(cause),
      );
    }
  }

  private recipients(
    actorId: number,
    engineerId: number | null | undefined,
  ): number[] {
    return [...new Set([actorId, ...(engineerId ? [engineerId] : [])])];
  }

  /** `false` when the run already ended (the sweeper got there first), so nobody is told twice. */
  private async markFailed(runId: number, error: AiError): Promise<boolean> {
    const repo = this.dataSource.manager.getRepository(EstimateAiRun);
    const run = await repo.findOne({ where: { id: runId } });
    if (!run || !ACTIVE_STATUSES.includes(run.status)) return false;
    run.status = EstimateAiRunStatus.FAILED;
    run.error = runErrorText(error);
    await repo.save(run);
    return true;
  }

  private assertRole(actor: AuthUserPayload): void {
    if (!actor.role || !ESTIMATE_AI_ROLES.includes(actor.role)) {
      throw new ForbiddenException(
        'Only sales, a sales manager or the director may use AI pre-fill.',
      );
    }
  }

  private async assertEligible(
    manager: EntityManager,
    request: SalesRequest,
  ): Promise<void> {
    if (!TRIGGER_STATUSES.includes(request.status)) {
      throw new ConflictException(
        `A request ${request.status} cannot be filled by AI.`,
      );
    }
    const existing = await manager
      .getRepository(Estimate)
      .findOne({ where: { requestId: request.id, isDeleted: false } });
    if (existing && !(await isReplaceableAiDraft(manager, request, existing))) {
      throw new ConflictException(
        'The request already has an estimate that AI cannot replace.',
      );
    }
    const hasText = (request.technicalRequirements ?? '').trim() !== '';
    const hasFile = await manager
      .getRepository(SalesRequestAttachment)
      .exists({ where: { requestId: request.id } });
    if (!hasText && !hasFile) {
      throw new ConflictException(
        'Add requirements or an attachment before using AI.',
      );
    }
    const [{ n }]: Array<{ n: number }> = await manager.query(
      'SELECT COUNT(*)::int AS n FROM items WHERE is_deleted = false',
    );
    if (n > MAX_CATALOG_ITEMS) {
      throw new ConflictException('Catalog too large for AI run');
    }
  }

  private async assertWithinDailyCap(
    manager: EntityManager,
    userId: number,
  ): Promise<void> {
    const [{ n }]: Array<{ n: number }> = await manager.query(
      DAILY_RUN_COUNT_SQL,
      [userId],
    );
    if (n >= ESTIMATE_AI_DAILY_RUN_CAP) {
      throw new HttpException(
        'Daily AI run limit reached.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async inputOf(request: SalesRequest) {
    const manager = this.dataSource.manager;
    const attachments = await manager
      .getRepository(SalesRequestAttachment)
      .find({ where: { requestId: request.id }, order: { id: 'ASC' } });
    const catalog: CatalogItem[] = await manager.query(
      `SELECT id, code, name, brand, unit FROM items
       WHERE is_deleted = false ORDER BY id`,
    );
    return {
      requirements: request.technicalRequirements ?? '',
      attachments: attachments.map(({ fileName, storageKey }) => ({
        fileName,
        storageKey,
      })),
      template: await this.templateOf(manager, request.projectId),
      catalog,
      storage: this.storage,
    };
  }

  /**
   * The template of the request's project, only while it is live and active; a project may still
   * point at one that was deleted or deactivated since, and then the run goes without.
   * shortcut: cross-plugin table read, move to a gateway if more template fields are needed
   */
  private async templateOf(
    manager: EntityManager,
    projectId: number | null | undefined,
  ): Promise<PrefillTemplate | null> {
    if (!projectId) return null;
    const rows: TemplateRow[] = await manager.query(TEMPLATE_SQL, [projectId]);
    if (rows.length === 0) return null;
    const panels = new Map<number, PrefillTemplate['panels'][number]>();
    for (const row of rows) {
      const panel = panels.get(row.panel_id) ?? {
        tag: row.tag,
        description: row.description ?? '',
        quantity: row.panel_quantity,
        lines: [],
      };
      panels.set(row.panel_id, panel);
      if (row.item_id !== null) {
        panel.lines.push({
          itemId: row.item_id,
          quantity: Number(row.line_quantity),
          groupLabel: row.group_label,
          note: row.note,
        });
      }
    }
    return { panels: [...panels.values()] };
  }
}
