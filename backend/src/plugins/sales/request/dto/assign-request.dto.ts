import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AssignRequestDto {
  @ApiProperty({ description: 'Engineer (or engineering lead) to assign' })
  @Type(() => Number)
  @IsInt({ message: 'Engineer is required.' })
  @Min(1, { message: 'Engineer is required.' })
  engineerId: number;
}
