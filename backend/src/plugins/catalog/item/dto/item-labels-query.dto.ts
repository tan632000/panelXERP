import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { ITEM_LABELS_MAX } from '@plugins/catalog/item/constants/item-limits.constant';

/** Largest id a Postgres `integer` key holds; a bigger one would reach the database as a 500. */
const ID_MAX = 2147483647;
const DECIMAL = /^\d+$/;

/**
 * `ids=1,2,3` arrives as one string. Only plain decimal digits count: `0x10`, `1e3` and `1.5`
 * become NaN here, so validation refuses them instead of `Number()` reading them as numbers.
 */
const toIdList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((id) => (DECIMAL.test(id.trim()) ? Number(id.trim()) : NaN))
    : value;

const toNumber = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && DECIMAL.test(value.trim())
    ? Number(value.trim())
    : value;

export class ItemLabelsQueryDto {
  @ApiProperty({
    description: 'Comma-separated item ids, one label per id and copy',
    example: '1,2',
  })
  @Transform(toIdList)
  @IsArray({ message: 'ids is required.' })
  @ArrayMinSize(1, { message: 'ids is required.' })
  @IsInt({ each: true, message: 'ids must be whole numbers.' })
  @Min(1, { each: true, message: 'ids must be positive.' })
  @Max(ID_MAX, { each: true, message: 'ids must not exceed 2147483647.' })
  ids: number[];

  @ApiPropertyOptional({
    description: `Copies of each label (at least 1); ids x copies must not exceed ${ITEM_LABELS_MAX}`,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Transform(toNumber)
  @IsInt({ message: 'copies must be a whole number.' })
  @Min(1, { message: 'copies must be at least 1.' })
  copies: number = 1;
}
