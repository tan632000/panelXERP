import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class EstimateRevisionQueryDto {
  @ApiPropertyOptional({
    description: 'Revision number to read; the latest when omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision?: number;
}
