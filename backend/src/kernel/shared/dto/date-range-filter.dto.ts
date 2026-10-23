import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '@shared/dto/pagination.dto';

/** Shared date/customer filters for sales documents. Extend and add feature-specific fields only. */
export class DateRangeFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
