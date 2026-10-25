import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';

export class OrderFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Part of the order code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Only orders of this customer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiPropertyOptional({ description: 'Only the order of this quotation' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quotationId?: number;
}
