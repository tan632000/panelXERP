import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import { QuotationVersionStatus } from '@plugins/sales/quotation/enums/quotation-version-status.enum';

export class QuotationFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    enum: QuotationVersionStatus,
    description: 'Status of the latest version',
  })
  @IsOptional()
  @IsEnum(QuotationVersionStatus)
  status?: QuotationVersionStatus;

  @ApiPropertyOptional({ description: 'Part of the quotation code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Only quotations of this customer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiPropertyOptional({ description: 'Only the quotation of this request' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestId?: number;
}
