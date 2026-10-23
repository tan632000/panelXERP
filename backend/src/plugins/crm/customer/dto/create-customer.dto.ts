import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { IsMasterDataCode } from '@shared/decorators/is-master-data-code.decorator';

import { CUSTOMER_CODE_PREFIX } from '@plugins/crm/customer/constants/customer-code.constant';

export class CreateCustomerDto {
  @ApiProperty({
    description: 'Customer code (KH_xxxx)',
    maxLength: 30,
    example: 'KH_0001',
  })
  @IsMasterDataCode(CUSTOMER_CODE_PREFIX, {
    label: 'Customer code',
    maxLength: 30,
  })
  code: string;

  @ApiProperty({ description: 'Customer name', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Customer name is required.' })
  @MinLength(1, { message: 'Customer name is required.' })
  @MaxLength(255, { message: 'Customer name must not exceed 255 characters.' })
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

  @ApiPropertyOptional({
    description:
      'Owning sales account. Defaults to the caller; only an actor who sees all customers may name another account.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sales owner must be a user id.' })
  @Min(1, { message: 'Sales owner must be a user id.' })
  salesOwnerId?: number;

  @ApiPropertyOptional({ description: 'Note', maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(2000, { message: 'Note must not exceed 2000 characters.' })
  note?: string;
}
