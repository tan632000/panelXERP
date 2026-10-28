import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import {
  PURCHASE_ORDER_MAX_LINES,
  PURCHASE_ORDER_VAT_RATES,
} from '@plugins/inventory/purchase-order/constants/purchase-order.constant';

const MAX_QUANTITY = 1_000_000;
const MAX_UNIT_PRICE = 10_000_000_000;
const MAX_NOTE_LENGTH = 2000;

export class PurchaseOrderLineDto {
  @ApiProperty({ description: 'Catalog item' })
  @Type(() => Number)
  @IsInt({ message: 'Item is required.' })
  @Min(1, { message: 'Item is required.' })
  @Max(2147483647, { message: 'Item is required.' })
  itemId: number;

  @ApiProperty({ description: 'Quantity, up to 3 decimals', minimum: 0.001 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Quantity must be a number with at most 3 decimals.' },
  )
  @Min(0.001, { message: 'Quantity must be greater than 0.' })
  @Max(MAX_QUANTITY, { message: 'Quantity is too large.' })
  quantity: number;

  @ApiProperty({ description: 'Price of one unit excluding VAT, whole VND' })
  @Type(() => Number)
  @IsInt({ message: 'Unit price must be a whole number of VND.' })
  @Min(0, { message: 'Unit price must not be negative.' })
  @Max(MAX_UNIT_PRICE, { message: 'Unit price is too large.' })
  unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'Active supplier' })
  @Type(() => Number)
  @IsInt({ message: 'Supplier is required.' })
  @Min(1, { message: 'Supplier is required.' })
  @Max(2147483647, { message: 'Supplier is required.' })
  supplierId: number;

  @ApiPropertyOptional({
    description: 'Date the goods are expected (YYYY-MM-DD)',
    example: '2027-02-15',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  expectedDate?: string | null;

  @ApiProperty({
    description: 'VAT rate in percent',
    enum: PURCHASE_ORDER_VAT_RATES,
  })
  @Type(() => Number)
  @IsIn([...PURCHASE_ORDER_VAT_RATES], {
    message: 'VAT rate must be 0, 5, 8 or 10.',
  })
  vatRate: number;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, nullable: true })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(MAX_NOTE_LENGTH, {
    message: `Note must not exceed ${MAX_NOTE_LENGTH} characters.`,
  })
  note?: string | null;

  @ApiProperty({ type: [PurchaseOrderLineDto] })
  @IsArray({ message: 'Lines are required.' })
  @ArrayMaxSize(PURCHASE_ORDER_MAX_LINES, {
    message: `At most ${PURCHASE_ORDER_MAX_LINES} lines are allowed.`,
  })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines: PurchaseOrderLineDto[];
}

/** Any header field given replaces it; `lines`, when given, replaces every line. */
export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Active supplier' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Supplier is required.' })
  @Min(1, { message: 'Supplier is required.' })
  @Max(2147483647, { message: 'Supplier is required.' })
  supplierId?: number;

  @ApiPropertyOptional({
    description: 'Date the goods are expected (YYYY-MM-DD); null clears it',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  expectedDate?: string | null;

  @ApiPropertyOptional({ enum: PURCHASE_ORDER_VAT_RATES })
  @IsOptional()
  @Type(() => Number)
  @IsIn([...PURCHASE_ORDER_VAT_RATES], {
    message: 'VAT rate must be 0, 5, 8 or 10.',
  })
  vatRate?: number;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, nullable: true })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(MAX_NOTE_LENGTH, {
    message: `Note must not exceed ${MAX_NOTE_LENGTH} characters.`,
  })
  note?: string | null;

  @ApiPropertyOptional({ type: [PurchaseOrderLineDto] })
  @IsOptional()
  @IsArray({ message: 'Lines must be a list.' })
  @ArrayMaxSize(PURCHASE_ORDER_MAX_LINES, {
    message: `At most ${PURCHASE_ORDER_MAX_LINES} lines are allowed.`,
  })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];
}

/** Why an order is rejected, cancelled or short-closed. */
export class PurchaseOrderReasonDto {
  @ApiProperty({ maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Reason is required.' })
  @MinLength(1, { message: 'Reason is required.' })
  @MaxLength(1000, { message: 'Reason must not exceed 1000 characters.' })
  reason: string;
}
