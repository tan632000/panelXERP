import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { isUniqueViolationOn } from '@shared/utils/db-error.util';

import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';
import {
  AiError,
  AiOutputInvalidError,
} from '@plugins/sales/estimate/ai/ai-errors';
import {
  MAX_AI_NOTE_LENGTH,
  MAX_SUMMARY_LENGTH,
  type EstimateDraft,
} from '@plugins/sales/estimate/ai/prefill-schema';
import { redactMoney } from '@plugins/sales/estimate/ai/redact-money';
import {
  AI_REQUIREMENTS_PREFIX,
  MAX_TECHNICAL_REQUIREMENTS_LENGTH,
} from '@plugins/sales/estimate/constants/estimate-ai.constant';
import {
  ESTIMATE_CODE_PREFIX,
  ESTIMATE_CODE_UNIQUE_INDEX,
  ESTIMATE_TABLE,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTE_LENGTH,
} from '@plugins/sales/estimate/constants/estimate.constant';
import { EstimateAiRun } from '@plugins/sales/estimate/entities/estimate-ai-run.entity';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateAiRunStatus } from '@plugins/sales/estimate/enums/estimate-ai-run-status.enum';
import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';
import {
  loadRevisionTree,
  recalculateRevision,
} from '@plugins/sales/estimate/utils/estimate-revision.util';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { SkippedDocument } from '@plugins/sales/estimate/ai/document-reader';
import type { EntityManager } from 'typeorm';

/** The request, its estimate or the run changed while the AI was working; nothing was written. */
export class EstimateAiRequestChangedError extends AiError {
  readonly code = 'AI_REQUEST_CHANGED';
  constructor() {
    super('Yêu cầu đã thay đổi trong lúc AI chạy.');
  }
}

/** The sweeper already failed the run; a late job must not write behind it. */
export class EstimateAiRunInactiveError extends AiError {
  readonly code = 'AI_RUN_INACTIVE';
  constructor() {
    super('Lượt chạy AI đã kết thúc.');
  }
}

export interface EstimateAiWriteInput {
  runId: number;
  requestId: number;
  actorId: number;
  draft: EstimateDraft;
  skipped: SkippedDocument[];
}

export interface EstimateAiWriteResult {
  estimate: Estimate;
  request: SalesRequest;
  summary: string;
}

const WRITABLE_REQUEST_STATUSES: readonly RequestStatus[] = [
  RequestStatus.DRAFT,
  RequestStatus.ASSIGNED,
];
/**
 * An estimate an AI run may replace: a single draft revision whose every panel and line is
 * AI-made and unverified, on a request still `draft`. Nobody can edit or verify before the
 * request leaves `draft`, so such a draft has not been touched by a person.
 */
export async function isReplaceableAiDraft(
  manager: EntityManager,
  request: SalesRequest,
  estimate: Estimate,
): Promise<boolean> {
  if (request.status !== RequestStatus.DRAFT || estimate.latestRevision !== 1) {
    return false;
  }
  const revisions = await manager
    .getRepository(EstimateRevision)
    .find({ where: { estimateId: estimate.id } });
  const [only] = revisions;
  if (revisions.length !== 1 || only.status !== EstimateRevisionStatus.DRAFT) {
    return false;
  }
  const tree = await loadRevisionTree(manager, only.id);
  // An estimate with no panel is not an AI draft: an engineer's own, still empty.
  return (
    tree.panels.length > 0 &&
    tree.panels.every(
      ({ panel, bomLines, costLines }) =>
        panel.isAiGenerated &&
        costLines.length === 0 &&
        bomLines.every((line) => line.isAiGenerated && !line.isVerified),
    )
  );
}

/** The catalog rows still alive, locked shared so a delete of one waits for this commit. */
export const LIVE_ITEMS_SQL = `SELECT id, code, name, brand, unit, reference_price
  FROM items WHERE id = ANY($1::int[]) AND is_deleted = false FOR SHARE`;

const REQUEST_ESTIMATE_UNIQUE_INDEX = 'uq_sales_estimates_request_id';
const MAX_ACTIVITY_UNMATCHED = 10;

/** Money-free, trimmed and cut to the column: every AI-authored string passes through here. */
const safe = (value: string, max: number): string =>
  redactMoney(value).trim().slice(0, max);

/**
 * Turns a validated draft into rows in ONE transaction: it re-checks what the trigger checked
 * (the request may have been cancelled, deleted or estimated by hand while the AI worked), writes
 * the estimate tree, advances the request and marks the run `succeeded`. Any failure rolls all of
 * it back; notifications are the caller's, after the commit.
 */
@Injectable()
export class EstimateAiWriterService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly statusPort: RequestStatusPort,
  ) {}

  write(input: EstimateAiWriteInput): Promise<EstimateAiWriteResult> {
    return createWithDocumentCode(
      this.dataSource,
      {
        table: ESTIMATE_TABLE,
        prefix: ESTIMATE_CODE_PREFIX,
        codeUniqueIndex: ESTIMATE_CODE_UNIQUE_INDEX,
        exhaustedMessage:
          'Could not allocate an estimate code, please try again.',
      },
      async (manager, code) => {
        try {
          return await this.writeTree(manager, code, input);
        } catch (error: unknown) {
          // A hand-made estimate that slipped in after the pre-check: say so, not "duplicate key".
          if (isUniqueViolationOn(error, [REQUEST_ESTIMATE_UNIQUE_INDEX])) {
            throw new EstimateAiRequestChangedError();
          }
          throw error;
        }
      },
    );
  }

  private async writeTree(
    manager: EntityManager,
    code: string,
    { runId, requestId, actorId, draft, skipped }: EstimateAiWriteInput,
  ): Promise<EstimateAiWriteResult> {
    const estimateRepo = manager.getRepository(Estimate);
    const requestRepo = manager.getRepository(SalesRequest);

    // Lock order of every estimate write: estimate, then request. A first run has no estimate
    // yet, so it takes the request alone and re-checks for one afterwards.
    const peeked = await estimateRepo.findOne({
      where: { requestId, isDeleted: false },
    });
    const existing = peeked
      ? await estimateRepo.findOne({
          where: { id: peeked.id, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        })
      : null;
    const request = await requestRepo.findOne({
      where: { id: requestId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request || !WRITABLE_REQUEST_STATUSES.includes(request.status)) {
      throw new EstimateAiRequestChangedError();
    }

    const run = await manager.getRepository(EstimateAiRun).findOne({
      where: { id: runId },
      lock: { mode: 'pessimistic_write' },
    });
    if (run?.status !== EstimateAiRunStatus.RUNNING) {
      throw new EstimateAiRunInactiveError();
    }

    const rerun = await this.checkReplaceable(
      manager,
      request,
      existing,
      peeked,
    );

    const live = await this.liveItems(
      manager,
      draft.panels.flatMap((panel) => panel.lines.map((line) => line.itemId)),
    );
    const panels = draft.panels
      .map((panel) => {
        const kept = panel.lines.filter((line) => live.has(line.itemId));
        const dropped = panel.lines
          .filter((line) => !live.has(line.itemId))
          .map(
            (line) =>
              `Bỏ dòng: vật tư #${line.itemId} không còn trong danh mục.`,
          );
        return { panel, kept, dropped };
      })
      .filter(({ kept }) => kept.length > 0);
    // Nothing usable is no draft: an empty estimate would only block the engineer's own.
    if (panels.length === 0) throw new AiOutputInvalidError();

    const estimate =
      existing ?? (await this.createEstimate(manager, code, request, actorId));
    const revisionRepo = manager.getRepository(EstimateRevision);
    const revision = await revisionRepo.findOne({
      where: { estimateId: estimate.id, revision: 1 },
    });
    if (!revision) throw new EstimateAiRequestChangedError();
    if (rerun) await this.clearTree(manager, revision.id);

    const panelRepo = manager.getRepository(EstimatePanel);
    const bomRepo = manager.getRepository(EstimateBomLine);
    for (const { panel, kept, dropped } of panels) {
      const saved = await panelRepo.save(
        panelRepo.create({
          revisionId: revision.id,
          tag: panel.tag,
          description: safe(panel.description, MAX_DESCRIPTION_LENGTH) || null,
          quantity: panel.quantity,
          unitCost: 0,
          total: 0,
          isAiGenerated: true,
          aiNote:
            safe(
              [panel.aiNote, ...dropped].filter(Boolean).join('\n'),
              MAX_AI_NOTE_LENGTH,
            ) || null,
        }),
      );
      for (const line of kept) {
        const item = live.get(line.itemId) as LiveItem;
        await bomRepo.save(
          bomRepo.create({
            panelId: saved.id,
            itemId: item.id,
            itemCode: item.code,
            itemName: item.name,
            itemBrand: item.brand,
            itemUnit: item.unit,
            quantity: line.quantity,
            unitCost: item.referencePrice,
            amount: 0,
            note: null,
            isAiGenerated: true,
            aiConfidence: line.confidence,
            aiNote: safe(line.note, MAX_NOTE_LENGTH) || null,
            isVerified: false,
          }),
        );
      }
    }
    estimate.updatedBy = actorId;
    await recalculateRevision(manager, revision, estimate);

    const summary = this.summaryOf(
      draft,
      skipped,
      panels.length,
      panels.reduce((sum, { kept }) => sum + kept.length, 0),
    );
    request.technicalRequirements = this.mergeRequirements(
      request.technicalRequirements,
      safe(draft.requirementsSummary, MAX_SUMMARY_LENGTH),
      rerun,
    );
    // Saved before `advance`, which reloads the row: a later save of this copy would undo it.
    await requestRepo.save(request);
    if (request.status === RequestStatus.ASSIGNED) {
      await this.statusPort.advance(
        manager,
        request.id,
        RequestStatus.ESTIMATING,
        {
          actorId,
        },
      );
    }
    await recordRequestActivity(manager, {
      requestId,
      action: 'estimate_ai_filled',
      actorId,
      note: this.activityNote(estimate.code, draft),
    });

    run.status = EstimateAiRunStatus.SUCCEEDED;
    run.estimateId = estimate.id;
    run.summary = summary;
    run.error = null;
    await manager.getRepository(EstimateAiRun).save(run);
    return { estimate, request, summary };
  }

  /** No estimate yet, or a replaceable AI draft. Returns whether this is such a re-run. */
  private async checkReplaceable(
    manager: EntityManager,
    request: SalesRequest,
    existing: Estimate | null,
    peeked: Estimate | null,
  ): Promise<boolean> {
    if (!existing) {
      // The estimate appeared (or vanished) between the peek and the lock: start over.
      if (peeked) throw new EstimateAiRequestChangedError();
      const appeared = await manager
        .getRepository(Estimate)
        .exists({ where: { requestId: request.id, isDeleted: false } });
      if (appeared) throw new EstimateAiRequestChangedError();
      return false;
    }
    if (!(await isReplaceableAiDraft(manager, request, existing))) {
      throw new EstimateAiRequestChangedError();
    }
    return true;
  }

  private async createEstimate(
    manager: EntityManager,
    code: string,
    request: SalesRequest,
    actorId: number,
  ): Promise<Estimate> {
    const estimateRepo = manager.getRepository(Estimate);
    const estimate = await estimateRepo.save(
      estimateRepo.create({
        code,
        requestId: request.id,
        status: EstimateRevisionStatus.DRAFT,
        latestRevision: 1,
        total: 0,
        createdBy: actorId,
        isDeleted: false,
      }),
    );
    const revisionRepo = manager.getRepository(EstimateRevision);
    await revisionRepo.save(
      revisionRepo.create({
        estimateId: estimate.id,
        revision: 1,
        status: EstimateRevisionStatus.DRAFT,
        total: 0,
        createdBy: actorId,
      }),
    );
    return estimate;
  }

  private async clearTree(
    manager: EntityManager,
    revisionId: number,
  ): Promise<void> {
    const panels = await manager
      .getRepository(EstimatePanel)
      .find({ where: { revisionId } });
    if (panels.length === 0) return;
    const panelIds = panels.map((panel) => panel.id);
    await manager
      .getRepository(EstimateBomLine)
      .delete({ panelId: In(panelIds) });
    await manager
      .getRepository(EstimateCostLine)
      .delete({ panelId: In(panelIds) });
    await manager.getRepository(EstimatePanel).delete({ revisionId });
  }

  /** The catalog rows still alive, read under a shared lock so a delete waits for this commit. */
  private async liveItems(
    manager: EntityManager,
    ids: number[],
  ): Promise<Map<number, LiveItem>> {
    const rows: Array<{
      id: number;
      code: string;
      name: string;
      brand: string | null;
      unit: string;
      reference_price: string | number | null;
    }> = await manager.query(LIVE_ITEMS_SQL, [[...new Set(ids)]]);
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          code: row.code,
          name: row.name,
          brand: row.brand,
          unit: row.unit,
          referencePrice:
            row.reference_price === null ? 0 : Number(row.reference_price),
        },
      ]),
    );
  }

  /** Empty text is filled; written text is kept and the AI part follows, cut to the column. */
  private mergeRequirements(
    current: string | null | undefined,
    aiText: string,
    rerun: boolean,
  ): string | null {
    if (!aiText) return current ?? null;
    // Every AI block carries the prefix, so a re-run finds and replaces it instead of stacking.
    const marker = `

${AI_REQUIREMENTS_PREFIX}`;
    const text = current ?? '';
    let cut = -1;
    if (rerun) {
      cut = text.startsWith(AI_REQUIREMENTS_PREFIX)
        ? 0
        : text.lastIndexOf(marker);
    }
    const base = (cut >= 0 ? text.slice(0, cut) : text).trim();
    const prefix = base ? marker : AI_REQUIREMENTS_PREFIX;
    const room =
      MAX_TECHNICAL_REQUIREMENTS_LENGTH - base.length - prefix.length;
    return room > 0
      ? `${base}${prefix}${aiText.slice(0, room)}`
      : base.slice(0, MAX_TECHNICAL_REQUIREMENTS_LENGTH);
  }

  private summaryOf(
    draft: EstimateDraft,
    skipped: SkippedDocument[],
    panelCount: number,
    lineCount: number,
  ): string {
    const parts = [
      safe(draft.requirementsSummary, MAX_SUMMARY_LENGTH),
      `AI tạo ${panelCount} tủ, ${lineCount} dòng vật tư.`,
    ];
    if (draft.unmatched.length > 0) {
      parts.push(`${draft.unmatched.length} hạng mục chưa khớp danh mục.`);
    }
    if (skipped.length > 0) {
      parts.push(
        `Bỏ qua ${skipped.length} tệp: ${skipped
          .map((doc) =>
            safe(`${doc.fileName} (${doc.reason})`, MAX_NOTE_LENGTH),
          )
          .filter(Boolean)
          .join('; ')}.`,
      );
    }
    return parts.filter(Boolean).join('\n');
  }

  private activityNote(code: string, draft: EstimateDraft): string {
    const unmatched = draft.unmatched
      .slice(0, MAX_ACTIVITY_UNMATCHED)
      .map((entry) =>
        safe(`${entry.description} — ${entry.reason}`, MAX_NOTE_LENGTH),
      )
      .filter(Boolean);
    if (unmatched.length === 0) return code;
    const more = draft.unmatched.length - unmatched.length;
    return [
      `${code}: chưa khớp danh mục`,
      ...unmatched.map((line) => `- ${line}`),
      ...(more > 0 ? [`- và ${more} mục khác`] : []),
    ].join('\n');
  }
}

interface LiveItem {
  id: number;
  code: string;
  name: string;
  brand: string | null;
  unit: string;
  referencePrice: number;
}
