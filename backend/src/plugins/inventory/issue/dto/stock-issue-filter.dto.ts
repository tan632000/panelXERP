import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

/** The list filter of issues and of workshop returns. */
export class OrderStockDocumentFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ description: 'Only the documents of this order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  orderId?: number;
}
