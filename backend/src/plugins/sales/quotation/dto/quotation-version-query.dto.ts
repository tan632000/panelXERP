import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class QuotationVersionQueryDto {
  @ApiPropertyOptional({
    description: 'Version number to read; the latest when omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ver?: number;
}
