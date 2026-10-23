import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

import { SortableListFilterQueryDto } from '@shared/dto/list-filter.dto';

export class ContactFilterDto extends SortableListFilterQueryDto {
  @ApiPropertyOptional({ description: 'Only the contacts of this customer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;
}
