import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { bulkSoftDelete } from '@shared/utils/bulk-delete.util';
import {
  applyListWhere,
  findColumnValues,
  mergeColumnFilterConditions,
  toListScopeQuery,
  type ColumnFilterMap,
} from '@shared/utils/column-filter.util';
import { toColumnSortOrder } from '@shared/utils/column-sort.util';
import { rethrowUniqueViolation } from '@shared/utils/db-error.util';
import { assertMasterDataCodeUnchanged } from '@shared/utils/master-data-code.util';
import { previewMaxBasedCode } from '@shared/utils/max-based-code.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';
import { assertCaseInsensitiveUnique } from '@shared/utils/unique-field.util';

import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { ownerCondition } from '@plugins/crm/_shared/utils/owner-scope.util';
import { requireText, trimToNull } from '@plugins/crm/_shared/utils/text.util';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { PROJECT_CODE_PREFIX } from '@plugins/crm/project/constants/project-code.constant';
import { CreateProjectDto } from '@plugins/crm/project/dto/create-project.dto';
import {
  ProjectColumnValuesQueryDto,
  ProjectFilterDto,
} from '@plugins/crm/project/dto/project-filter.dto';
import { UpdateProjectDto } from '@plugins/crm/project/dto/update-project.dto';
import { Project } from '@plugins/crm/project/entities/project.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/** Columns the list table filters and enumerates values for. Text columns only. */
export const PROJECT_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  name: { field: 'name' },
  siteAddress: { field: 'siteAddress' },
  customerName: { field: 'name', relation: 'customer' },
};

/** A project as the API returns it: the row plus the code and name of its customer. */
export type ProjectView = Omit<Project, 'customer'> & {
  customerCode: string | null;
  customerName: string | null;
  quotationTemplateName: string | null;
};

const PROJECT_LABEL = 'Project';
const CUSTOMER_LABEL = 'Customer';
const REFERENCED_MESSAGE =
  'Cannot delete project because it is referenced by sales documents.';

const TEMPLATE_NOT_USABLE = 'Quotation template must be an active template.';

/** Name the project registers under at the customer delete check. */
const CUSTOMER_CHECK_NAME = 'project';

@Injectable()
export class ProjectService implements OnModuleInit {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly dataScope: DataScopeService,
    private readonly referenceChecks: ReferenceCheckRegistry,
  ) {}

  /** A customer with an active project cannot be deleted: the projects keep naming it. */
  onModuleInit(): void {
    this.referenceChecks.registerCustomerCheck(
      CUSTOMER_CHECK_NAME,
      (customerId) => this.hasActiveProject(customerId),
    );
  }

  /** The list's keyword and owner-scope conditions, before any column selection. */
  private listWhere(
    query: Pick<ProjectFilterDto, 'search' | 'customerId'>,
    actor: AuthUserPayload,
  ) {
    const base: Record<string, unknown> = {
      isDeleted: false,
      // Visibility follows the customer's owner; a deleted customer hides its projects.
      customer: {
        isDeleted: false,
        ...ownerCondition(this.dataScope.scopeOf(actor), actor.userId),
      },
    };
    if (query.customerId) base.customerId = query.customerId;
    return buildIlikeOrWhere(
      base,
      ['code', 'name', 'siteAddress'],
      query.search,
    );
  }

  async findAll(query: ProjectFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const where = mergeColumnFilterConditions(
      this.listWhere(query, actor),
      PROJECT_COLUMN_FILTERS,
      query.columnFilters,
    );
    const order = toColumnSortOrder<Project>({
      map: PROJECT_COLUMN_FILTERS,
      query,
      fallback: { field: 'createdAt', direction: 'DESC' },
    });

    const [rows, total] = await this.projectRepo.findAndCount({
      where,
      relations: { customer: true },
      skip,
      take,
      order,
    });

    return paginate(await this.toViews(rows), total, page, limit);
  }

  /** Distinct values of one filterable column, limited to the projects the actor can see. */
  findColumnValues(query: ProjectColumnValuesQueryDto, actor: AuthUserPayload) {
    const where = this.listWhere(toListScopeQuery(query), actor);
    return findColumnValues(this.projectRepo, query, {
      alias: 'project',
      map: PROJECT_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) => applyListWhere(qb, alias, Project, where),
    });
  }

  async findOne(id: number, actor: AuthUserPayload): Promise<ProjectView> {
    const [view] = await this.toViews([await this.findVisible(id, actor)]);
    return view;
  }

  async create(
    dto: CreateProjectDto,
    actor: AuthUserPayload,
  ): Promise<ProjectView> {
    // A customer the actor cannot see answers 404, so its id cannot be probed through projects.
    const customer = await this.findVisibleCustomer(dto.customerId, actor);

    const code = dto.code.trim();
    await this.assertCodeUnique(code);
    await this.assertTemplateUsable(dto.quotationTemplateId);

    const project = this.projectRepo.create({
      code,
      customerId: customer.id,
      name: requireText(dto.name, 'Project name is required.'),
      siteAddress: trimToNull(dto.siteAddress),
      note: trimToNull(dto.note),
      quotationTemplateId: dto.quotationTemplateId ?? null,
      createdBy: actor.userId,
      isDeleted: false,
    });

    try {
      const saved = await this.projectRepo.save(project);
      const [view] = await this.toViews([{ ...saved, customer }]);
      return view;
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, () => this.assertCodeUnique(code));
    }
  }

  async update(
    id: number,
    dto: UpdateProjectDto,
    actor: AuthUserPayload,
  ): Promise<ProjectView> {
    const project = await this.findVisible(id, actor);

    assertMasterDataCodeUnchanged(project.code, dto.code);

    if (dto.name !== undefined) {
      project.name = requireText(dto.name, 'Project name is required.');
    }
    if (dto.siteAddress !== undefined) {
      project.siteAddress = trimToNull(dto.siteAddress);
    }
    if (dto.note !== undefined) project.note = trimToNull(dto.note);
    if (dto.quotationTemplateId !== undefined) {
      await this.assertTemplateUsable(dto.quotationTemplateId);
      project.quotationTemplateId = dto.quotationTemplateId;
    }
    project.updatedBy = actor.userId;

    const [view] = await this.toViews([await this.projectRepo.save(project)]);
    return view;
  }

  async remove(id: number, actor: AuthUserPayload) {
    const project = await this.findVisible(id, actor);

    const referencedBy = await this.referenceChecks.referencingProject(id);
    if (referencedBy.length > 0) {
      throw new ConflictException(REFERENCED_MESSAGE);
    }

    return softDeleteWithAudit(this.projectRepo, project, actor.userId);
  }

  /** Soft-deletes the rows ticked in the list, each through `remove` and its own guards. */
  removeMany(ids: number[], actor: AuthUserPayload) {
    return bulkSoftDelete(ids, (id) => this.remove(id, actor));
  }

  async getNextCode(): Promise<{ code: string }> {
    const code = await previewMaxBasedCode(this.projectRepo.manager, {
      table: 'projects',
      prefix: PROJECT_CODE_PREFIX,
    });
    return { code };
  }

  /** Reads the project through its customer's owner: out of scope answers 404. */
  private async findVisible(
    id: number,
    actor: AuthUserPayload,
  ): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id, isDeleted: false, customer: { isDeleted: false } },
      relations: { customer: true },
    });
    this.dataScope.assertVisible(actor, project?.customer, PROJECT_LABEL);
    return project as Project;
  }

  private async findVisibleCustomer(
    id: number,
    actor: AuthUserPayload,
  ): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id, isDeleted: false },
    });
    return this.dataScope.assertVisible(actor, customer, CUSTOMER_LABEL);
  }

  private async hasActiveProject(customerId: number): Promise<boolean> {
    const project = await this.projectRepo.findOne({
      where: { customerId, isDeleted: false },
      select: { id: true },
    });
    return project !== null;
  }

  private assertCodeUnique(code: string): Promise<void> {
    // Active rows only: the unique index is partial, so a deleted project's code is reusable.
    return assertCaseInsensitiveUnique(this.projectRepo, {
      field: 'code',
      value: code,
      message: 'Project code already exists.',
    });
  }

  /**
   * A project accepts a live, active template or none. Skipped for null so CRM never touches
   * sales tables unless a template is chosen.
   * shortcut: cross-plugin table read, move to a gateway if more template fields are needed
   */
  private async assertTemplateUsable(id: number | null | undefined) {
    if (id === null || id === undefined) return;
    const rows: unknown[] = await this.projectRepo.manager.query(
      `SELECT id FROM quotation_templates
        WHERE id = $1 AND is_deleted = false AND is_active = true`,
      [id],
    );
    if (rows.length === 0) throw new BadRequestException(TEMPLATE_NOT_USABLE);
  }

  /** Names of the templates the rows point at (any state: a deactivated one keeps its name). */
  private async templateNames(rows: Project[]): Promise<Map<number, string>> {
    const ids = [
      ...new Set(rows.map((row) => row.quotationTemplateId).filter(Boolean)),
    ] as number[];
    if (ids.length === 0) return new Map();
    // shortcut: cross-plugin table read, move to a gateway if more template fields are needed
    const found: Array<{ id: number; name: string }> =
      await this.projectRepo.manager.query(
        `SELECT id, name FROM quotation_templates WHERE id = ANY($1::int[])`,
        [ids],
      );
    return new Map(found.map((row) => [Number(row.id), row.name]));
  }

  private async toViews(rows: Project[]): Promise<ProjectView[]> {
    const names = await this.templateNames(rows);
    return rows.map((project) => {
      const { customer, ...row } = project;
      return {
        ...row,
        customerCode: customer?.code ?? null,
        customerName: customer?.name ?? null,
        quotationTemplateName:
          names.get(project.quotationTemplateId ?? 0) ?? null,
      };
    });
  }
}
