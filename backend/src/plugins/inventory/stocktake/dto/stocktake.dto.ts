import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import {
  StocktakeScope,
  StocktakeStatus,
} from '@plugins/inventory/stocktake/enums/stocktake.enum';

const MAX_QUANTITY = 1_000_000;
const MAX_TEXT_LENGTH = 2000;

export class CreateStocktakeDto {
  @ApiProperty({ enum: StocktakeScope })
  @IsEnum(StocktakeScope, { message: 'Scope must be all or location.' })
  scope: StocktakeScope;

  @ApiPropertyOptional({
    description: 'The location counted, when the scope is one location',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Location must be a number.' })
  @Min(1)
  @Max(2147483647)
  locationId?: number;

  @ApiPropertyOptional({ maxLength: MAX_TEXT_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  note?: string | null;
}

export class StocktakeScanDto {
  @ApiProperty({ description: 'A scanned barcode or a typed item code' })
  @IsString({ message: 'Code is required.' })
  @MaxLength(128)
  code: string;
}

export class StocktakeCountDto {
  @ApiProperty({
    description: 'Counted quantity, up to 3 decimals',
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Counted quantity must be a number with at most 3 decimals.' },
  )
  @Min(0, { message: 'Counted quantity must not be negative.' })
  @Max(MAX_QUANTITY, { message: 'Counted quantity is too large.' })
  countedQty: number;
}

export class StocktakeReasonDto {
  @ApiProperty({ maxLength: MAX_TEXT_LENGTH })
  @IsString({ message: 'Reason is required.' })
  @MaxLength(MAX_TEXT_LENGTH)
  reason: string;
}

export class StocktakeFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: StocktakeStatus })
  @IsOptional()
  @IsEnum(StocktakeStatus, { message: 'Unknown status.' })
  status?: StocktakeStatus;
}
