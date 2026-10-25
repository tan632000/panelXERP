import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  MAX_BOM_QUANTITY,
  MAX_NOTE_LENGTH,
  MAX_UNIT_COST,
} from '@plugins/sales/estimate/constants/estimate.constant';

export class CreateBomLineDto {
  @ApiProperty({ description: 'Catalog item' })
  @Type(() => Number)
  @IsInt({ message: 'Item is required.' })
  @Min(1, { message: 'Item is required.' })
  itemId: number;

  @ApiProperty({ description: 'Quantity, up to 3 decimals', minimum: 0.001 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Quantity must be a number with at most 3 decimals.' },
  )
  @Min(0.001, { message: 'Quantity must be greater than 0.' })
  @Max(MAX_BOM_QUANTITY, { message: 'Quantity is too large.' })
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Cost of one unit in VND, up to 2 decimals; the item reference price (0 when it has none) when omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Unit cost must be a number with at most 2 decimals.' },
  )
  @Min(0, { message: 'Unit cost must not be negative.' })
  @Max(MAX_UNIT_COST, { message: 'Unit cost is too large.' })
  unitCost?: number;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, nullable: true })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(MAX_NOTE_LENGTH, {
    message: `Note must not exceed ${MAX_NOTE_LENGTH} characters.`,
  })
  note?: string | null;
}

/** The item of a line is fixed: to use another one, delete the line and add a new one. */
export class UpdateBomLineDto extends PartialType(
  OmitType(CreateBomLineDto, ['itemId'] as const),
) {}
