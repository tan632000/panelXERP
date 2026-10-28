import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import { PurchaseOrderStatus } from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';

export class PurchaseOrderFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus, { message: 'Unknown status.' })
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({ description: 'Only the orders to this supplier' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  supplierId?: number;
}
