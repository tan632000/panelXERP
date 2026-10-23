import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { ColumnValuesQueryFor } from '@shared/dto/column-filter.dto';
import { SortableListFilterQueryDto } from '@shared/dto/list-filter.dto';

export class UserFilterDto extends SortableListFilterQueryDto {
  @ApiPropertyOptional({ description: 'Filter by role code' })
  @IsOptional()
  @IsString()
  roleCode?: string;

  @ApiPropertyOptional({
    description: 'Filter by account state; omitted returns both',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}

/** Column values of the list, scoped to the rows its toolbar leaves. */
export class UserColumnValuesQueryDto extends ColumnValuesQueryFor(
  UserFilterDto,
) {}
