import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

import { ColumnValuesQueryFor } from '@shared/dto/column-filter.dto';
import { SortableListFilterQueryDto } from '@shared/dto/list-filter.dto';
import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

export class RequestFilterDto extends SortableListFilterQueryDto {
  @ApiPropertyOptional({ enum: RequestStatus, description: 'Only this status' })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({
    description: 'Only requests assigned to this engineer',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedEngineerId?: number;

  @ApiPropertyOptional({
    description: 'Quotation due on or after this date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateOnly()
  quotationDueFrom?: string;

  @ApiPropertyOptional({
    description: 'Quotation due on or before this date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateOnly()
  quotationDueTo?: string;
}

/** Column values of the list, scoped to the rows its toolbar leaves. */
export class RequestColumnValuesQueryDto extends ColumnValuesQueryFor(
  RequestFilterDto,
) {}
