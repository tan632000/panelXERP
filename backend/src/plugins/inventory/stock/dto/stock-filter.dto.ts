import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';
import { PaginationQueryDto } from '@shared/dto/pagination.dto';

/** Most item ids one availability read accepts: a whole estimate revision fits well within it. */
export const STOCK_AVAILABILITY_MAX_IDS = 500;
/** Largest id a Postgres `integer` key holds; a bigger one would reach the database as a 500. */
const ID_MAX = 2147483647;
const DECIMAL = /^\d+$/;

/**
 * `itemIds=1,2,3` arrives as one string. Only plain decimal digits count: `0x10`, `1e3` and
 * `1.5` become NaN here, so validation refuses them instead of `Number()` reading them.
 */
const toIdList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((id) => (DECIMAL.test(id.trim()) ? Number(id.trim()) : NaN))
    : value;

/** A query string carries booleans as text; anything else is left for the validator to refuse. */
const QUERY_BOOLEANS: Readonly<Record<string, boolean>> = {
  true: true,
  false: false,
};

export class StockFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Only items whose default location is this one',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;

  @ApiPropertyOptional({
    description: 'Only items whose available stock is below their minimum',
    type: Boolean,
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => QUERY_BOOLEANS[String(value)] ?? value,
  )
  @IsBoolean()
  lowOnly?: boolean;
}

export class StockMovementFilterDto extends PaginationQueryDto {}

export class StockAvailabilityQueryDto {
  @ApiProperty({
    description: `Comma-separated item ids (1–${STOCK_AVAILABILITY_MAX_IDS})`,
    type: String,
    example: '1,2',
  })
  @Transform(toIdList)
  @IsArray({ message: 'itemIds is required.' })
  @ArrayMinSize(1, { message: 'itemIds is required.' })
  @ArrayMaxSize(STOCK_AVAILABILITY_MAX_IDS, {
    message: `At most ${STOCK_AVAILABILITY_MAX_IDS} item ids are allowed.`,
  })
  @IsInt({ each: true, message: 'itemIds must be whole numbers.' })
  @Min(1, { each: true, message: 'itemIds must be positive.' })
  @Max(ID_MAX, { each: true, message: 'itemIds must not exceed 2147483647.' })
  itemIds: number[];
}
