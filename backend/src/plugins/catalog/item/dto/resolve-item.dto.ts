import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveItemQueryDto {
  @ApiProperty({
    description: 'Scanned value: an item barcode, else an item code (any case)',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Code is required.' })
  @MinLength(1, { message: 'Code is required.' })
  @MaxLength(255, { message: 'Code must not exceed 255 characters.' })
  code: string;
}
