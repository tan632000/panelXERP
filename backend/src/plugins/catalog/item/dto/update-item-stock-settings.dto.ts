import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ITEM_MIN_STOCK_MAX } from '@plugins/catalog/item/constants/item-limits.constant';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Only the fields sent change; an explicit `null` (or a blank barcode) clears the field. */
export class UpdateItemStockSettingsDto {
  @ApiPropertyOptional({
    description:
      'Barcode, unique among active items and never another item code (any case)',
    maxLength: 64,
    nullable: true,
  })
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'Barcode must be a string.' })
  @MaxLength(64, { message: 'Barcode must not exceed 64 characters.' })
  barcode?: string | null;

  @ApiPropertyOptional({
    description: 'Default warehouse location id',
    type: Number,
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: 'Default location must be a location id.' })
  @Min(1, { message: 'Default location must be a location id.' })
  defaultLocationId?: number | null;

  @ApiPropertyOptional({
    description: 'Minimum stock (>= 0); blank means no low-stock alert',
    type: Number,
    nullable: true,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Minimum stock must be a number with at most 3 decimals.' },
  )
  @Min(0, { message: 'Minimum stock must not be negative.' })
  @Max(ITEM_MIN_STOCK_MAX, { message: 'Minimum stock is too large.' })
  minStock?: number | null;
}
