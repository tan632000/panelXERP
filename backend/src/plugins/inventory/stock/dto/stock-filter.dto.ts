import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';
import { PaginationQueryDto } from '@shared/dto/pagination.dto';

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
