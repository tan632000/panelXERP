import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { uniqueViolationConflict } from '@shared/utils/db-error.util';
import { assertMasterDataCodeUnchanged } from '@shared/utils/master-data-code.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';
import { assertCaseInsensitiveUnique } from '@shared/utils/unique-field.util';

import {
  requireText,
  trimToNull,
} from '@plugins/sales/_shared/utils/text.util';
import {
  CreateQuotationTemplateDto,
  QuotationTemplateFilterDto,
  TemplatePanelDto,
  UpdateQuotationTemplateDto,
} from '@plugins/sales/template/dto/quotation-template.dto';
import { QuotationTemplateLine } from '@plugins/sales/template/entities/quotation-template-line.entity';
import { QuotationTemplatePanel } from '@plugins/sales/template/entities/quotation-template-panel.entity';
import { QuotationTemplate } from '@plugins/sales/template/entities/quotation-template.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

const CODE_TAKEN = 'Template code already exists.';
const CODE_INDEX = 'uq_quotation_templates_code_active';

/**
 * A live project naming the template. Lives here, not in CRM, so the guard exists only while the
 * template feature does.
 * shortcut: cross-plugin table read, move to a gateway if more project fields are needed
 */
export const TEMPLATE_IN_LIVE_PROJECT_SQL = `
  SELECT 1 FROM projects
  WHERE quotation_template_id = $1 AND is_deleted = false
  LIMIT 1
`;

/** The catalog columns a line shows; read live, never stored on the template. */
interface ItemRow {
  id: number;
  code: string;
  name: string;
  brand: string | null;
  unit: string;
}

export type TemplateLineView = QuotationTemplateLine & {
  itemCode: string | null;
  itemName: string | null;
  itemBrand: string | null;
  itemUnit: string | null;
};

export type TemplatePanelView = QuotationTemplatePanel & {
  lines: TemplateLineView[];
};

export type TemplateView = QuotationTemplate & { panels: TemplatePanelView[] };

/**
 * Reusable panel and part lists, priced by nobody. A write replaces a template's panels and
 * lines wholesale inside one transaction, so a failure part-way leaves the old content intact.
 */
@Injectable()
export class QuotationTemplateService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: QuotationTemplateFilterDto) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const base: Record<string, unknown> = { isDeleted: false };
    if (query.isActive !== undefined) base.isActive = query.isActive;

    const [rows, total] = await this.dataSource.manager
      .getRepository(QuotationTemplate)
      .findAndCount({
        where: buildIlikeOrWhere(base, ['code', 'name'], query.search),
        order: { code: 'ASC' },
        skip,
        take,
      });
    return paginate(rows, total, page, limit);
  }

  async findOne(id: number): Promise<TemplateView> {
    const { manager } = this.dataSource;
    return this.view(manager, await this.findLive(manager, id));
  }

  async create(
    dto: CreateQuotationTemplateDto,
    actor: AuthUserPayload,
  ): Promise<TemplateView> {
    const code = dto.code.trim();
    const name = requireText(dto.name, 'Template name is required.');
    assertTagsDistinct(dto.panels);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(QuotationTemplate);
      await assertCaseInsensitiveUnique(repo, {
        field: 'code',
        value: code,
        message: CODE_TAKEN,
      });
      await this.assertItemsLive(manager, dto.panels);

      let template: QuotationTemplate;
      try {
        template = await repo.save(
          repo.create({
            code,
            name,
            description: trimToNull(dto.description),
            isActive: true,
            createdBy: actor.userId,
            isDeleted: false,
          }),
        );
      } catch (error: unknown) {
        // A concurrent create took the code between the pre-check and the insert.
        throw (
          uniqueViolationConflict(error, [
            { matches: [CODE_INDEX], message: CODE_TAKEN },
          ]) ?? error
        );
      }
      await this.insertPanels(manager, template.id, dto.panels);
      return this.view(manager, template);
    });
  }

  async update(
    id: number,
    dto: UpdateQuotationTemplateDto,
    actor: AuthUserPayload,
  ): Promise<TemplateView> {
    if (dto.panels) assertTagsDistinct(dto.panels);

    return this.dataSource.transaction(async (manager) => {
      // The row lock queues a concurrent edit behind this one, so panels never interleave.
      const template = await this.findLive(manager, id, true);
      assertMasterDataCodeUnchanged(template.code, dto.code);

      if (dto.name !== undefined) {
        template.name = requireText(dto.name, 'Template name is required.');
      }
      if (dto.description !== undefined) {
        template.description = trimToNull(dto.description);
      }
      template.updatedBy = actor.userId;
      await manager.getRepository(QuotationTemplate).save(template);

      if (dto.panels) {
        await this.assertItemsLive(manager, dto.panels);
        await this.deletePanels(manager, template.id);
        await this.insertPanels(manager, template.id, dto.panels);
      }
      return this.view(manager, template);
    });
  }

  setActive(
    id: number,
    isActive: boolean,
    actor: AuthUserPayload,
  ): Promise<TemplateView> {
    return this.dataSource.transaction(async (manager) => {
      const template = await this.findLive(manager, id, true);
      template.isActive = isActive;
      template.updatedBy = actor.userId;
      await manager.getRepository(QuotationTemplate).save(template);
      return this.view(manager, template);
    });
  }

  async remove(id: number, actor: AuthUserPayload): Promise<{ id: number }> {
    const { manager } = this.dataSource;
    const template = await this.findLive(manager, id);
    const used: unknown[] = await manager.query(TEMPLATE_IN_LIVE_PROJECT_SQL, [
      id,
    ]);
    if (used.length > 0) {
      throw new ConflictException(
        'Cannot delete template because a project uses it.',
      );
    }
    return softDeleteWithAudit(
      manager.getRepository(QuotationTemplate),
      template,
      actor.userId,
    );
  }

  private async findLive(
    manager: EntityManager,
    id: number,
    lock = false,
  ): Promise<QuotationTemplate> {
    const template = await manager.getRepository(QuotationTemplate).findOne({
      where: { id, isDeleted: false },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!template) throw new NotFoundException('Template not found.');
    return template;
  }

  /**
   * Every item a line names must be a live catalog item. The shared lock makes a concurrent
   * item delete wait for this transaction, so a line can never name an item that just vanished.
   */
  private async assertItemsLive(
    manager: EntityManager,
    panels: readonly TemplatePanelDto[],
  ): Promise<void> {
    const wanted = [
      ...new Set(panels.flatMap((p) => p.lines.map((l) => l.itemId))),
    ].sort((a, b) => a - b);
    if (wanted.length === 0) return;

    const live: Array<{ id: number }> = await manager.query(
      `SELECT id FROM items
        WHERE id = ANY($1::int[]) AND is_deleted = false
        ORDER BY id FOR SHARE`,
      [wanted],
    );
    const found = new Set(live.map((row) => Number(row.id)));
    const missing = wanted.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Item must be an active catalog item (not found: ${missing.join(', ')}).`,
      );
    }
  }

  /** Lines go first, in this transaction, rather than leaning on the foreign keys' cascade. */
  private async deletePanels(
    manager: EntityManager,
    templateId: number,
  ): Promise<void> {
    const panelRepo = manager.getRepository(QuotationTemplatePanel);
    const panels = await panelRepo.find({ where: { templateId } });
    if (panels.length === 0) return;
    await manager
      .getRepository(QuotationTemplateLine)
      .delete({ panelId: In(panels.map((panel) => panel.id)) });
    await panelRepo.delete({ templateId });
  }

  private async insertPanels(
    manager: EntityManager,
    templateId: number,
    panels: readonly TemplatePanelDto[],
  ): Promise<void> {
    const panelRepo = manager.getRepository(QuotationTemplatePanel);
    const lineRepo = manager.getRepository(QuotationTemplateLine);
    for (const dto of panels) {
      const panel = await panelRepo.save(
        panelRepo.create({
          templateId,
          tag: requireText(dto.tag, 'Tag is required.'),
          description: trimToNull(dto.description),
          quantity: dto.quantity,
        }),
      );
      if (dto.lines.length === 0) continue;
      await lineRepo.save(
        dto.lines.map((line) =>
          lineRepo.create({
            panelId: panel.id,
            itemId: line.itemId,
            quantity: line.quantity,
            groupLabel: trimToNull(line.groupLabel),
            note: trimToNull(line.note),
          }),
        ),
      );
    }
  }

  private async view(
    manager: EntityManager,
    template: QuotationTemplate,
  ): Promise<TemplateView> {
    const panels = await manager
      .getRepository(QuotationTemplatePanel)
      .find({ where: { templateId: template.id }, order: { id: 'ASC' } });
    const lines = panels.length
      ? await manager.getRepository(QuotationTemplateLine).find({
          where: { panelId: In(panels.map((panel) => panel.id)) },
          order: { id: 'ASC' },
        })
      : [];
    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    const items: ItemRow[] = itemIds.length
      ? await manager.query(
          `SELECT id, code, name, brand, unit FROM items WHERE id = ANY($1::int[])`,
          [itemIds],
        )
      : [];
    const itemById = new Map(items.map((item) => [Number(item.id), item]));

    return {
      ...template,
      panels: panels.map((panel) => ({
        ...panel,
        lines: lines
          .filter((line) => line.panelId === panel.id)
          .map((line) => {
            const item = itemById.get(line.itemId);
            return {
              ...line,
              itemCode: item?.code ?? null,
              itemName: item?.name ?? null,
              itemBrand: item?.brand ?? null,
              itemUnit: item?.unit ?? null,
            };
          }),
      })),
    };
  }
}

/** Tags are unique within a template, case-insensitively, like the index over them. */
function assertTagsDistinct(panels: readonly TemplatePanelDto[]): void {
  const seen = new Set<string>();
  for (const panel of panels) {
    const tag = requireText(panel.tag, 'Tag is required.').toLowerCase();
    if (seen.has(tag)) {
      throw new ConflictException(
        `Panel tag ${panel.tag.trim()} is already used.`,
      );
    }
    seen.add(tag);
  }
}
