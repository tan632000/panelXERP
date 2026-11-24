import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class AiPrefillDto {
  @ApiProperty({ description: 'The request whose estimate the AI fills.' })
  @IsInt()
  @Min(1)
  requestId: number;
}
