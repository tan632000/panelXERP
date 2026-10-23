# Backend templates

Copy-paste skeletons for every backend file of a CRUD feature. Placeholders are defined in
[`runbook.md`](runbook.md). Fragments marked *(only if …)* are dropped when the feature does not
need them.

Reference implementation:
`backend/src/plugins/master-data/surface-treatment-material/`.

---

## `enums/<feature>-<axis>.enum.ts`

Members are **English camelCase string values**. Vietnamese labels live only in the frontend i18n
bundle.

```ts
export enum <Feature><Axis> {
  MEMBER_ONE = 'memberOne',
  MEMBER_TWO = 'memberTwo',
  OTHER = 'other',
}
```

---

## `constants/<feature>-code.constant.ts` *(only if the feature has a business code)*

Master data uses `_`; documents use `-`.

```ts
/** <Feature> code prefix — codes read `XX_0001` (see `master-data-code.util`). */
export const <FEATURE>_CODE_PREFIX = 'XX_';
```

---

## `entities/<feature>.entity.ts`

```ts
import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import { <Feature><Axis> } from '@plugins/<plugin>/<feature>/enums/<feature>-<axis>.enum';

@Entity('<table>')
export class <Feature> extends BaseEntity {
  /** Business code — UI column "<label from mock>" (e.g. XX_0007) */
  @Column({ type: 'varchar', length: 30, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, enum: <Feature><Axis> })
  <axis>: <Feature><Axis>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  someOptional?: string | null;

  // camelCase property, explicit snake_case column when they differ
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'some_other' })
  someOther?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
```

`BaseEntity` already supplies `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`,
`deletedAt`, `deletedBy`, `isDeleted`. Never redeclare them. Enums are stored as `varchar`, never
a Postgres enum type.

---

## `permissions/<feature>.permissions.ts`

```ts
export const <FEATURE>_READ = '<feature_key>:read' as const;
export const <FEATURE>_WRITE = '<feature_key>:write' as const;
export const <FEATURE>_DELETE = '<feature_key>:delete' as const;

export const <featureCamel>Permissions = [
  <FEATURE>_READ,
  <FEATURE>_WRITE,
  <FEATURE>_DELETE,
] as const;
```

Add extra verbs (`:approve`, `:cancel`, `:export`, `:notify`) **only** when the Function List has
a matching row.

---

## `dto/create-<feature>.dto.ts`

Every field carries a Swagger decorator **and** a validator with an explicit English message.

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { IsMasterDataCode } from '@shared/decorators/is-master-data-code.decorator';

import { <FEATURE>_CODE_PREFIX } from '@plugins/<plugin>/<feature>/constants/<feature>-code.constant';
import { <Feature><Axis> } from '@plugins/<plugin>/<feature>/enums/<feature>-<axis>.enum';

export class Create<Feature>Dto {
  @ApiProperty({ description: '<Feature> code (XX_xxxx)', maxLength: 30, example: 'XX_0001' })
  @IsMasterDataCode(<FEATURE>_CODE_PREFIX, { label: '<Feature> code', maxLength: 30 })
  code: string;

  @ApiProperty({ description: '<Feature> name', maxLength: 255, example: 'Example name' })
  @IsString({ message: '<Feature> name is required.' })
  @MinLength(1, { message: '<Feature> name is required.' })
  @MaxLength(255, { message: '<Feature> name must not exceed 255 characters.' })
  name: string;

  @ApiProperty({ description: 'Classification', enum: <Feature><Axis>, example: <Feature><Axis>.MEMBER_ONE })
  @IsEnum(<Feature><Axis>, { message: 'Classification is required.' })
  <axis>: <Feature><Axis>;

  @ApiPropertyOptional({ description: 'Manufacturer', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'Manufacturer must be a string.' })
  @MaxLength(255, { message: 'Manufacturer must not exceed 255 characters.' })
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString({ message: 'Notes must be a string.' })
  @MaxLength(2000, { message: 'Notes must not exceed 2000 characters.' })
  notes?: string;
}
```

Date-only fields use `@IsDateOnly` — a raw ISO-8601 string field is an ESLint error
(`erp/no-iso8601-date-field`).

---

## `dto/update-<feature>.dto.ts`

```ts
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { Create<Feature>Dto } from '@plugins/<plugin>/<feature>/dto/create-<feature>.dto';

/** Multipart sends booleans as text, so coerce before validating. */
function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return Boolean(value);
}

export class Update<Feature>Dto extends PartialType(Create<Feature>Dto) {
  // only if the feature has file uploads
  @ApiPropertyOptional({ description: 'Remove the currently uploaded <doc> file' })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  remove<Doc>?: boolean;
}
```

---

## `dto/<feature>-filter.dto.ts`

`SortableListFilterQueryDto` already provides `page`, `limit`, `search`, `sortBy`, `sortOrder`
and `columnFilters`. Add only feature-specific axes.

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { SortableListFilterQueryDto } from '@shared/dto/list-filter.dto';

import { <Feature><Axis> } from '@plugins/<plugin>/<feature>/enums/<feature>-<axis>.enum';

export class <Feature>FilterDto extends SortableListFilterQueryDto {
  @ApiPropertyOptional({ description: 'Filter by classification', enum: <Feature><Axis> })
  @IsOptional()
  @IsEnum(<Feature><Axis>)
  <axis>?: <Feature><Axis>;
}
```

---

## `services/<feature>.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { bulkSoftDelete } from '@shared/utils/bulk-delete.util';
import {
  findColumnValues,
  mergeColumnFilterConditions,
  type ColumnFilterMap,
  type ColumnValuesQuery,
} from '@shared/utils/column-filter.util';
import { rethrowUniqueViolation } from '@shared/utils/db-error.util';
import { resolveListSort, toListOrder } from '@shared/utils/list-query.util';
import { previewMaxBasedCode } from '@shared/utils/max-based-code.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { findActiveByIdOrThrow } from '@shared/utils/repository.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';
import { assertCaseInsensitiveUnique } from '@shared/utils/unique-field.util';

import { <Feature> } from '@plugins/<plugin>/<feature>/entities/<feature>.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/** Columns the list table filters and enumerates values for. Text and enum columns only. */
export const <FEATURE>_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  name: { field: 'name' },
  <axis>: { field: '<axis>' },
  // …one entry per column the table marks `filterable`
};

@Injectable()
export class <Feature>Service {
  constructor(
    @InjectRepository(<Feature>)
    private readonly repo: Repository<<Feature>>,
  ) {}

  async findAll(query: <Feature>FilterDto) {
    const { page, limit, skip, take } = resolvePagination(query, DEFAULT_LIST_PAGE_SIZE);

    const baseConditions: Record<string, unknown> = { isDeleted: false };
    if (query.<axis>) baseConditions.<axis> = query.<axis>;

    const where = mergeColumnFilterConditions(
      buildIlikeOrWhere(baseConditions, ['code', 'name'], query.search),
      <FEATURE>_COLUMN_FILTERS,
      query.columnFilters,
    );

    const order = toListOrder<<Feature>>(
      resolveListSort(query, ['createdAt', 'code', 'name', '<axis>']),
    );

    const [data, total] = await this.repo.findAndCount({ where, skip, take, order });
    return paginate(data, total, page, limit);
  }

  /** Distinct values of one filterable column, for the list table's column filter. */
  findColumnValues(query: ColumnValuesQuery) {
    return findColumnValues(this.repo, query, {
      alias: '<feature_key>',
      map: <FEATURE>_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) => qb.where(`${alias}.isDeleted = false`),
    });
  }

  async findOne(id: number) {
    return findActiveByIdOrThrow(this.repo, id, '<Feature label>');
  }

  async create(dto: Create<Feature>Dto, currentUser: AuthUserPayload) {
    const code = dto.code.trim();
    const name = dto.name.trim();

    await this.assertCodeUnique(code);
    await this.assertNameUnique(name);

    const item = this.repo.create({
      code,
      name,
      <axis>: dto.<axis>,
      manufacturer: dto.manufacturer?.trim() || null,   // empty optional -> null
      notes: dto.notes?.trim() || null,
      createdBy: currentUser.userId,
      isDeleted: false,
    });

    try {
      return await this.repo.save(item);
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, async () => {
        await this.assertCodeUnique(code);
        await this.assertNameUnique(name);
      });
    }
  }

  async update(id: number, dto: Update<Feature>Dto, currentUser: AuthUserPayload) {
    const item = await findActiveByIdOrThrow(this.repo, id, '<Feature label>');
    // `code` is immutable — never assign dto.code here
    if (dto.name !== undefined) {
      await this.assertNameUnique(dto.name.trim(), id);
      item.name = dto.name.trim();
    }
    item.updatedBy = currentUser.userId;
    return this.repo.save(item);
  }

  async canDelete(id: number) {
    // Query every feature that can reference this row; return false when any hit exists.
    return { canDelete: true };
  }

  async remove(id: number, currentUser: AuthUserPayload) {
    const item = await findActiveByIdOrThrow(this.repo, id, '<Feature label>');
    // Master-data codes are freed on delete — see the code utility for the freeing rule.
    return softDeleteWithAudit(this.repo, item, currentUser.userId);
  }

  removeMany(ids: number[], currentUser: AuthUserPayload) {
    return bulkSoftDelete(this.repo, ids, currentUser.userId);
  }

  getNextCode() {
    return previewMaxBasedCode(this.repo, <FEATURE>_CODE_PREFIX);
  }

  private assertCodeUnique(code: string, excludeId?: number) {
    // code is unique across ALL rows, including soft-deleted ones
    return assertCaseInsensitiveUnique(this.repo, 'code', code, { excludeId });
  }

  private assertNameUnique(name: string, excludeId?: number) {
    // name is unique among ACTIVE rows only
    return assertCaseInsensitiveUnique(this.repo, 'name', name, {
      excludeId,
      activeOnly: true,
    });
  }
}
```

Read the reference service before copying — the exact utility signatures are authoritative there,
not here.

---

## `<feature>.controller.ts`

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequirePermission } from '@kernel/core/auth/decorators/auth.decorators';

import { BulkDeleteEndpoint } from '@shared/decorators/bulk-delete-endpoint.decorator';
import { ColumnValuesEndpoint } from '@shared/decorators/column-values-endpoint.decorator';
import { BulkDeleteDto } from '@shared/dto/bulk-delete.dto';
import { ColumnValuesQueryDto } from '@shared/dto/column-filter.dto';
import { columnFilterKeys } from '@shared/utils/column-filter.util';

import { <FEATURE>_DELETE, <FEATURE>_READ, <FEATURE>_WRITE } from '@plugins/<plugin>/<feature>/permissions/<feature>.permissions';
import { <FEATURE>_COLUMN_FILTERS, <Feature>Service } from '@plugins/<plugin>/<feature>/services/<feature>.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('<plugin>/<features>')
@ApiBearerAuth()
@Controller('<features>')
export class <Feature>Controller {
  constructor(private readonly service: <Feature>Service) {}

  @Get()
  @RequirePermission(<FEATURE>_READ)
  @ApiOperation({ summary: 'List <features>', description: 'Paginated list with search and filters.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Paginated list' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(@Query() query: <Feature>FilterDto) {
    return this.service.findAll(query);
  }

  @ColumnValuesEndpoint({
    permission: <FEATURE>_READ,
    columns: columnFilterKeys(<FEATURE>_COLUMN_FILTERS),
  })
  findColumnValues(@Query() query: ColumnValuesQueryDto) {
    return this.service.findColumnValues(query);
  }

  @Get('next-code')
  @RequirePermission(<FEATURE>_WRITE)
  @ApiOperation({
    summary: 'Preview next code',
    description: 'Returns next suggested XX_xxxx code WITHOUT consuming a sequence.',
  })
  @ApiOkResponse({ description: 'Preview next available code' })
  getNextCode() {
    return this.service.getNextCode();
  }

  @Get(':id/can-delete')
  @RequirePermission(<FEATURE>_DELETE)
  @ApiOperation({ summary: 'Check whether the row can be deleted' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: '{ canDelete: boolean }' })
  canDelete(@Param('id', ParseIntPipe) id: number) {
    return this.service.canDelete(id);
  }

  @Get(':id')          // MUST come after every other GET with a literal path
  @RequirePermission(<FEATURE>_READ)
  @ApiOperation({ summary: 'Get <feature> by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 404, description: 'Not found or soft-deleted' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission(<FEATURE>_WRITE)
  @ApiOperation({
    summary: 'Create <feature>',
    description: 'Code unique (all rows including soft-deleted). Name unique among active rows.',
  })
  @ApiResponse({ status: 201, description: 'Created' })
  @ApiResponse({ status: 409, description: 'Duplicate code or name' })
  create(@Body() dto: Create<Feature>Dto, @CurrentUser() currentUser: AuthUserPayload) {
    return this.service.create(dto, currentUser);
  }

  @Patch(':id')
  @RequirePermission(<FEATURE>_WRITE)
  @ApiOperation({ summary: 'Update <feature>', description: 'Code is immutable. Name unique excluding self.' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Update<Feature>Dto,
    @CurrentUser() currentUser: AuthUserPayload,
  ) {
    return this.service.update(id, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermission(<FEATURE>_DELETE)
  @ApiOperation({ summary: 'Soft-delete <feature>', description: 'Blocks if referenced.' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 400, description: 'Referenced by business documents' })
  @ApiResponse({ status: 403, description: 'Forbidden — delete permission required' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() currentUser: AuthUserPayload) {
    return this.service.remove(id, currentUser);
  }

  @BulkDeleteEndpoint({ permission: <FEATURE>_DELETE, subject: '<features>' })
  bulkRemove(@Body() dto: BulkDeleteDto, @CurrentUser() currentUser: AuthUserPayload) {
    return this.service.removeMany(dto.ids, currentUser);
  }
}
```

---

## `<feature>.module.ts`

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { <Feature> } from '@plugins/<plugin>/<feature>/entities/<feature>.entity';
import { <Feature>Service } from '@plugins/<plugin>/<feature>/services/<feature>.service';
import { <Feature>Controller } from '@plugins/<plugin>/<feature>/<feature>.controller';

@Module({
  imports: [TypeOrmModule.forFeature([<Feature>])],
  controllers: [<Feature>Controller],
  providers: [<Feature>Service],
  exports: [<Feature>Service],
})
export class <Feature>Module {}
```

---

## `database/migrations/<epochMs>-init-<feature>.ts`

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init<Feature><epochMs> implements MigrationInterface {
  name = 'Init<Feature><epochMs>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS <table> (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        <axis> VARCHAR(50),
        manufacturer VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by INT REFERENCES users(id),
        updated_by INT REFERENCES users(id),
        deleted_at TIMESTAMPTZ,
        deleted_by INT REFERENCES users(id),
        is_deleted BOOLEAN NOT NULL DEFAULT false
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS <table> CASCADE`);
  }
}
```

A unique index that must tolerate soft-deleted rows is partial:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_<table>_name_active
  ON <table> (LOWER(name)) WHERE is_deleted = false;
```

---

## `database/seeds/seed-<feature>s.ts`

```ts
import { <Feature> } from '@plugins/<plugin>/<feature>/entities/<feature>.entity';
import { <Feature><Axis> } from '@plugins/<plugin>/<feature>/enums/<feature>-<axis>.enum';

import type { DataSource } from 'typeorm';

const SEED_ITEMS: Array<Partial<<Feature>>> = [
  { code: 'XX_0001', name: 'Example one', <axis>: <Feature><Axis>.MEMBER_ONE },
  { code: 'XX_0002', name: 'Example two', <axis>: <Feature><Axis>.MEMBER_TWO },
];

export async function seed<Feature>s(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(<Feature>);
  for (const item of SEED_ITEMS) {
    const existing = await repo.findOne({ where: { code: item.code } });
    if (existing) continue;                    // idempotent
    await repo.save(repo.create(item));
  }
}
```

---

## Feature catalog entry — `<plugin>.features.ts`

```ts
{
  key: '<feature>',
  plugin: '<plugin>',
  // dependsOn: ['product'],        // only when the flow docs show a real dependency
  module: <Feature>Module,
  permissions: <featureCamel>Permissions,
  seed: seed<Feature>s,
},
```

This single entry wires the Nest module, the permission catalog, the seed order **and** the
migration glob.
