import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

export class StockReceiptFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Only the receipts of this purchase order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  purchaseOrderId?: number;
}
