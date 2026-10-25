import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import { MAX_CONTRACT_NO_LENGTH } from '@plugins/sales/order/constants/order.constant';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateOrderDto {
  @ApiProperty({
    description: 'The quotation whose confirmed version becomes the order',
  })
  @Type(() => Number)
  @IsInt({ message: 'Quotation is required.' })
  @Min(1, { message: 'Quotation is required.' })
  quotationId: number;

  @ApiPropertyOptional({
    description: 'Contract number',
    maxLength: MAX_CONTRACT_NO_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Contract number must be a string.' })
  @MaxLength(MAX_CONTRACT_NO_LENGTH, {
    message: `Contract number must not exceed ${MAX_CONTRACT_NO_LENGTH} characters.`,
  })
  contractNo?: string | null;

  @ApiPropertyOptional({
    description: 'Contract date (YYYY-MM-DD)',
    example: '2027-01-20',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  contractDate?: string | null;

  @ApiPropertyOptional({
    description: 'Delivery date (YYYY-MM-DD)',
    example: '2027-02-15',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  deliveryDate?: string | null;
}
