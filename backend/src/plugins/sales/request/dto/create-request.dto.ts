import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRequestDto {
  @ApiProperty({ description: 'Customer the request is for' })
  @Type(() => Number)
  @IsInt({ message: 'Customer is required.' })
  @Min(1, { message: 'Customer is required.' })
  customerId: number;

  @ApiPropertyOptional({
    description: 'Project of that customer the request belongs to',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Project must be an id.' })
  @Min(1, { message: 'Project must be an id.' })
  projectId?: number | null;

  @ApiPropertyOptional({
    description: 'Contact person of that customer',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Contact must be an id.' })
  @Min(1, { message: 'Contact must be an id.' })
  contactId?: number | null;

  @ApiProperty({ description: 'Request title', maxLength: 255 })
  @Transform(trim)
  @IsString({ message: 'Title is required.' })
  @MinLength(1, { message: 'Title is required.' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters.' })
  title: string;

  @ApiPropertyOptional({
    description: 'Technical requirements',
    maxLength: 10000,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'Technical requirements must be a string.' })
  @MaxLength(10000, {
    message: 'Technical requirements must not exceed 10000 characters.',
  })
  technicalRequirements?: string | null;

  @ApiPropertyOptional({
    description: 'Date the customer wants delivery (YYYY-MM-DD)',
    example: '2027-02-15',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  requestedDeliveryDate?: string | null;

  @ApiPropertyOptional({
    description: 'Date the quotation is due (YYYY-MM-DD)',
    example: '2027-01-20',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  quotationDueDate?: string | null;
}
