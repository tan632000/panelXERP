import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ITEM_REFERENCE_PRICE_MAX } from '@plugins/catalog/item/constants/item-limits.constant';
import {
  ITEM_GROUPS,
  type ItemGroup,
} from '@plugins/catalog/item/enums/item-group.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateItemDto {
  @ApiProperty({
    description: 'Manufacturer part number or internal code',
    maxLength: 64,
    example: 'LC1D09M7',
  })
  @Transform(trim)
  @IsString({ message: 'Item code is required.' })
  @MinLength(1, { message: 'Item code is required.' })
  @MaxLength(64, { message: 'Item code must not exceed 64 characters.' })
  code: string;

  @ApiProperty({ description: 'Item name', maxLength: 255 })
  @Transform(trim)
  @IsString({ message: 'Item name is required.' })
  @MinLength(1, { message: 'Item name is required.' })
  @MaxLength(255, { message: 'Item name must not exceed 255 characters.' })
  name: string;

  @ApiPropertyOptional({ description: 'Technical specification' })
  @IsOptional()
  @IsString({ message: 'Specification must be a string.' })
  @MaxLength(2000, {
    message: 'Specification must not exceed 2000 characters.',
  })
  specification?: string;

  @ApiPropertyOptional({ description: 'Brand', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'Brand must be a string.' })
  @MaxLength(255, { message: 'Brand must not exceed 255 characters.' })
  brand?: string;

  @ApiProperty({ description: 'Item group', enum: ITEM_GROUPS })
  @IsIn(ITEM_GROUPS, { message: 'Item group is invalid.' })
  group: ItemGroup;

  @ApiProperty({
    description: 'Unit of measure, e.g. pcs, m, set',
    maxLength: 20,
  })
  @Transform(trim)
  @IsString({ message: 'Unit is required.' })
  @MinLength(1, { message: 'Unit is required.' })
  @MaxLength(20, { message: 'Unit must not exceed 20 characters.' })
  unit: string;

  @ApiPropertyOptional({
    description: 'Reference purchase price in VND (>= 0)',
    type: Number,
    nullable: true,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Reference price must be a number with at most 2 decimals.' },
  )
  @Min(0, { message: 'Reference price must not be negative.' })
  @Max(ITEM_REFERENCE_PRICE_MAX, { message: 'Reference price is too large.' })
  referencePrice?: number | null;

  @ApiPropertyOptional({ description: 'Note', maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(2000, { message: 'Note must not exceed 2000 characters.' })
  note?: string;
}
