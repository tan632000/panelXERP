import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';
import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import { PURCHASE_REQUEST_MAX_LINES } from '@plugins/inventory/purchase-request/constants/purchase-request.constant';

const MAX_QUANTITY = 1_000_000;
const MAX_TEXT_LENGTH = 2000;

export class PurchaseRequestLineDto {
  @ApiProperty({ description: 'Active catalog item' })
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

  @ApiPropertyOptional({
    description: 'Needed by (YYYY-MM-DD)',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  neededBy?: string | null;

  @ApiPropertyOptional({ maxLength: MAX_TEXT_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  note?: string | null;
}

export class CreatePurchaseRequestDto {
  @ApiPropertyOptional({ maxLength: MAX_TEXT_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  note?: string | null;

  @ApiProperty({ type: [PurchaseRequestLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A request needs at least one line.' })
  @ArrayMaxSize(PURCHASE_REQUEST_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines: PurchaseRequestLineDto[];
}

export class UpdatePurchaseRequestDto {
  @ApiPropertyOptional({ maxLength: MAX_TEXT_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  note?: string | null;

  @ApiPropertyOptional({
    type: [PurchaseRequestLineDto],
    description: 'Replaces every line; refused once anything has been ordered',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'A request needs at least one line.' })
  @ArrayMaxSize(PURCHASE_REQUEST_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines?: PurchaseRequestLineDto[];
}

export class PurchaseRequestReasonDto {
  @ApiProperty({ maxLength: MAX_TEXT_LENGTH })
  @IsString({ message: 'Reason is required.' })
  @MaxLength(MAX_TEXT_LENGTH)
  reason: string;
}

export class PurchaseRequestFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Only the requests raised for this sales order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  sourceOrderId?: number;
}
