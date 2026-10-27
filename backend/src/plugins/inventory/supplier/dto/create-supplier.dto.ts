import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSupplierDto {
  @ApiProperty({
    description: 'Supplier code, unique among active suppliers (any case)',
    maxLength: 64,
    example: 'NCC_0001',
  })
  @Transform(trimString)
  @IsString({ message: 'Supplier code is required.' })
  @MinLength(1, { message: 'Supplier code is required.' })
  @MaxLength(64, { message: 'Supplier code must not exceed 64 characters.' })
  code: string;

  @ApiProperty({ description: 'Supplier name', maxLength: 255 })
  @Transform(trimString)
  @IsString({ message: 'Supplier name is required.' })
  @MinLength(1, { message: 'Supplier name is required.' })
  @MaxLength(255, { message: 'Supplier name must not exceed 255 characters.' })
  name: string;

  @ApiPropertyOptional({ description: 'Tax code', maxLength: 20 })
  @IsOptional()
  @IsString({ message: 'Tax code must be a string.' })
  @MaxLength(20, { message: 'Tax code must not exceed 20 characters.' })
  taxCode?: string;

  @ApiPropertyOptional({ description: 'Address', maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'Address must be a string.' })
  @MaxLength(500, { message: 'Address must not exceed 500 characters.' })
  address?: string;

  @ApiPropertyOptional({ description: 'Phone number', maxLength: 20 })
  @IsOptional()
  @IsString({ message: 'Phone must be a string.' })
  @MaxLength(20, { message: 'Phone must not exceed 20 characters.' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Email address', maxLength: 255 })
  // An empty string or null clears the email on update, so only a non-empty value is checked.
  @ValidateIf(
    (dto: { email?: string | null }) =>
      dto.email !== undefined && dto.email !== null && dto.email !== '',
  )
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  @MaxLength(255, { message: 'Email must not exceed 255 characters.' })
  email?: string;

  @ApiPropertyOptional({ description: 'Contact person', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'Contact name must be a string.' })
  @MaxLength(255, { message: 'Contact name must not exceed 255 characters.' })
  contactName?: string;

  @ApiPropertyOptional({ description: 'Note', maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(2000, { message: 'Note must not exceed 2000 characters.' })
  note?: string;

  @ApiPropertyOptional({
    description: 'Whether the supplier is in use. Defaults to true.',
  })
  @IsOptional()
  @IsBoolean({ message: 'Active flag must be a boolean.' })
  isActive?: boolean;
}
