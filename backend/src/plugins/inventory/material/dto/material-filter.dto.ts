import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

/** Order statuses as the sales order stores them. */
export const MATERIAL_ORDER_STATUSES = [
  'open',
  'in_production',
  'delivered',
  'completed',
  'cancelled',
] as const;

export class MaterialOrderFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: MATERIAL_ORDER_STATUSES })
  @IsOptional()
  @IsIn([...MATERIAL_ORDER_STATUSES], { message: 'Unknown status.' })
  status?: string;

  @ApiPropertyOptional({
    description:
      'Only this sales owner’s orders; never widens the actor’s own scope',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  salesOwnerId?: number;
}
