import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';

export class ProductionOrderFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: ProductionOrderStatus })
  @IsOptional()
  @IsEnum(ProductionOrderStatus, { message: 'Unknown status.' })
  status?: ProductionOrderStatus;

  @ApiPropertyOptional({
    description: 'Only the production orders of this sales order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  orderId?: number;
}

/** The create picker: open orders that have no live production order yet. */
export class OpenOrderQueryDto {
  @ApiPropertyOptional({ description: 'Order code, customer or project' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
