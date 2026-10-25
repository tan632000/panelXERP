import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateQuotationDto {
  @ApiProperty({ description: 'The estimated request to quote' })
  @Type(() => Number)
  @IsInt({ message: 'Request is required.' })
  @Min(1, { message: 'Request is required.' })
  requestId: number;

  @ApiPropertyOptional({
    description:
      'Estimate revision to build from; it must be the latest submitted one (409 otherwise). The latest submitted revision when omitted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimateRevisionId?: number;
}
