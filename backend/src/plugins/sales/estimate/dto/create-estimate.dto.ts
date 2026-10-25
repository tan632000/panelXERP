import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateEstimateDto {
  @ApiProperty({
    description: 'The assigned request to build the estimate for',
  })
  @Type(() => Number)
  @IsInt({ message: 'Request is required.' })
  @Min(1, { message: 'Request is required.' })
  requestId: number;
}
