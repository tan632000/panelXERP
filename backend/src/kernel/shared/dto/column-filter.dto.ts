import { BadRequestException } from '@nestjs/common';
import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { DEFAULT_PAGE } from '@shared/constants/pagination';

import type { ColumnFilterSelections } from '@shared/utils/column-filter.util';

/** Guards against a request that would build an unbounded `IN` clause. */
const MAX_FILTERED_COLUMNS = 20;
const MAX_VALUES_PER_COLUMN = 500;

export const DEFAULT_COLUMN_VALUES_PAGE_SIZE = 50;

/**
 * Parse the `columnFilters` query parameter: a JSON map of column key to selected values,
 * e.g. `{"classification":["mechanical"],"code":["VT-0001",""]}`. An empty string selects
 * the rows with no value in that column.
 */
export function parseColumnFilterSelections(
  value: unknown,
): ColumnFilterSelections | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  const raw: unknown = typeof value === 'string' ? safeParseJson(value) : value;

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BadRequestException('columnFilters must be a JSON object');
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_FILTERED_COLUMNS) {
    throw new BadRequestException(
      `columnFilters accepts at most ${MAX_FILTERED_COLUMNS} columns`,
    );
  }

  const selections: ColumnFilterSelections = {};
  for (const [key, values] of entries) {
    if (!Array.isArray(values)) {
      throw new BadRequestException(
        `columnFilters.${key} must be an array of values`,
      );
    }
    if (values.length > MAX_VALUES_PER_COLUMN) {
      throw new BadRequestException(
        `columnFilters.${key} accepts at most ${MAX_VALUES_PER_COLUMN} values`,
      );
    }
    if (values.length === 0) continue;
    selections[key] = values.map((entry) => String(entry ?? ''));
  }

  return Object.keys(selections).length > 0 ? selections : undefined;
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new BadRequestException('columnFilters must be valid JSON');
  }
}

/** Mixin-free decorator set for the `columnFilters` parameter of a list DTO. */
export const ColumnFiltersQueryParam = () =>
  function (target: object, propertyKey: string | symbol) {
    ApiPropertyOptional({
      description:
        'JSON map of column key to selected values, e.g. {"classification":["mechanical"]}',
      type: String,
    })(target, propertyKey);
    IsOptional()(target, propertyKey);
    Transform(({ value }: { value: unknown }) =>
      parseColumnFilterSelections(value),
    )(target, propertyKey);
    // Without a value validator the global `whitelist` pipe would strip the parameter.
    IsObject()(target, propertyKey);
  };

/** Query of the distinct values one filterable column holds. */
export class ColumnValuesQueryDto {
  @ApiProperty({
    description: 'Column key to enumerate, as the list exposes it',
    example: 'classification',
  })
  @IsString()
  @IsNotEmpty()
  column!: string;

  @ApiPropertyOptional({ description: 'Search within the column values' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: DEFAULT_PAGE, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: DEFAULT_COLUMN_VALUES_PAGE_SIZE,
    description: 'Values per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = DEFAULT_COLUMN_VALUES_PAGE_SIZE;

  /** The list's other column selections; the values offered are those of its filtered rows. */
  @ColumnFiltersQueryParam()
  columnFilters?: ColumnFilterSelections;

  /**
   * The list's own keyword search. `search` already narrows the values themselves, so the
   * keyword narrowing the rows travels under its own name; a list honours it in its base
   * conditions, which offer only the values of the rows it currently shows.
   */
  @ApiPropertyOptional({ description: 'Keyword search of the list itself' })
  @IsOptional()
  @IsString()
  listSearch?: string;
}

/** List-query fields a column-values request never carries as list scope. */
const NON_SCOPE_LIST_FIELDS = [
  'search',
  'page',
  'limit',
  'sortBy',
  'sortOrder',
  'columnFilters',
] as const;

type NonScopeListField = (typeof NON_SCOPE_LIST_FIELDS)[number];

/**
 * The column-values query of one list: the base column-values fields plus every toolbar
 * filter the list query accepts (tab, status, classification, date range…), validated by the
 * list's own rules. The list keyword arrives as `listSearch`, since `search` narrows the values.
 *
 * With it the column filter offers only the values of the rows on screen, Excel-style.
 */
export function ColumnValuesQueryFor<L extends object>(listDto: new () => L) {
  // Omitting a field the list does not declare is a no-op, so one list serves every DTO.
  return IntersectionType(
    ColumnValuesQueryDto,
    OmitType(
      listDto,
      NON_SCOPE_LIST_FIELDS as unknown as ReadonlyArray<keyof L>,
    ),
  ) as unknown as new () => ColumnValuesQueryDto & Omit<L, NonScopeListField>;
}
