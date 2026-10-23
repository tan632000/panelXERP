import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ description: 'Customer the contact belongs to' })
  @Type(() => Number)
  @IsInt({ message: 'Customer is required.' })
  @Min(1, { message: 'Customer is required.' })
  customerId: number;

  @ApiProperty({ description: 'Contact name', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Contact name is required.' })
  @MinLength(1, { message: 'Contact name is required.' })
  @MaxLength(255, { message: 'Contact name must not exceed 255 characters.' })
  name: string;

  @ApiPropertyOptional({ description: 'Position', maxLength: 100 })
  @IsOptional()
  @IsString({ message: 'Position must be a string.' })
  @MaxLength(100, { message: 'Position must not exceed 100 characters.' })
  position?: string;

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

  @ApiPropertyOptional({
    description:
      'Primary contact of the customer; setting it demotes the previous primary contact.',
  })
  @IsOptional()
  @IsBoolean({ message: 'Primary flag must be a boolean.' })
  isPrimary?: boolean;
}
