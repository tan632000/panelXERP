import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

import { ColumnValuesQueryFor } from '@shared/dto/column-filter.dto';
import { SortableListFilterQueryDto } from '@shared/dto/list-filter.dto';

export class ProjectFilterDto extends SortableListFilterQueryDto {
  @ApiPropertyOptional({ description: 'Only the projects of this customer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;
}

/** Column values of the list, scoped to the rows its toolbar leaves. */
export class ProjectColumnValuesQueryDto extends ColumnValuesQueryFor(
  ProjectFilterDto,
) {}
