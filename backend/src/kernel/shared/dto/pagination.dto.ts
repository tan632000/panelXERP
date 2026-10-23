import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  DEFAULT_PAGE,
  DEFAULT_PICKER_PAGE_SIZE,
} from '@shared/constants/pagination';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: DEFAULT_PICKER_PAGE_SIZE,
    description: 'Items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = DEFAULT_PICKER_PAGE_SIZE;

  @ApiPropertyOptional({ description: 'Search keyword' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Enum values whose localized label matched `search`.
   *
   * Classification columns store an English enum while the client shows a translated label, so
   * a localized keyword can only be resolved to the English enum by the client. These widen the
   * keyword search; they do not narrow it the way a `category` filter does.
   */
  @ApiPropertyOptional({
    description: 'Enum values whose translated label matched the keyword',
    isArray: true,
    type: String,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): string[] | undefined => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  searchClassifications?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    totalLines?: number;
    /** On a list paged by document line: how many documents the matching lines belong to. */
    totalDocs?: number;
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
