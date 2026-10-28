import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLocationDto {
  @ApiProperty({
    description: 'Location code, unique among active locations (any case)',
    maxLength: 32,
    example: 'A-01-02',
  })
  @Transform(trimString)
  @IsString({ message: 'Location code is required.' })
  @MinLength(1, { message: 'Location code is required.' })
  @MaxLength(32, { message: 'Location code must not exceed 32 characters.' })
  code: string;

  @ApiProperty({ description: 'Location name', maxLength: 255 })
  @Transform(trimString)
  @IsString({ message: 'Location name is required.' })
  @MinLength(1, { message: 'Location name is required.' })
  @MaxLength(255, { message: 'Location name must not exceed 255 characters.' })
  name: string;

  @ApiPropertyOptional({ description: 'Note', maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(2000, { message: 'Note must not exceed 2000 characters.' })
  note?: string;

  @ApiPropertyOptional({
    description: 'Whether the location is in use. Defaults to true.',
  })
  @IsOptional()
  @IsBoolean({ message: 'Active flag must be a boolean.' })
  isActive?: boolean;
}
