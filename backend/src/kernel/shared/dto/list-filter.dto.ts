import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { ColumnFiltersQueryParam } from '@shared/dto/column-filter.dto';
import { PaginationQueryDto } from '@shared/dto/pagination.dto';

import type { ColumnFilterSelections } from '@shared/utils/column-filter.util';

/** List page filter base — overrides picker default (20) to list default (10). */
export class ListFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_LIST_PAGE_SIZE,
    description: 'Items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = DEFAULT_LIST_PAGE_SIZE;

  /**
   * Per-column value filters of the list table. Each list applies only the columns it
   * declares as filterable; unknown keys are ignored.
   */
  @ColumnFiltersQueryParam()
  columnFilters?: ColumnFilterSelections;
}

/** List filter with optional sort — extend and add feature-specific filters only. */
export class SortableListFilterQueryDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    description:
      'Sort column. Omitted means newest first (createdAt descending); an explicit column defaults to ascending.',
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order. Defaults to DESC for createdAt, ASC otherwise.',
    default: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
