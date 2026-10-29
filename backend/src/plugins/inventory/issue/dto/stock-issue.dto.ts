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
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { STOCK_ISSUE_MAX_LINES } from '@plugins/inventory/issue/constants/issue.constant';

const MAX_QUANTITY = 1_000_000;
const MAX_TEXT_LENGTH = 2000;

class OrderStockLineDto {
  @ApiProperty({ description: 'Catalog item' })
  @Type(() => Number)
  @IsInt({ message: 'Item is required.' })
  @Min(1, { message: 'Item is required.' })
  @Max(2147483647, { message: 'Item is required.' })
  itemId: number;

  @ApiPropertyOptional({
    description: 'Panel line of the order the material is for',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Order line must be a number.' })
  @Min(1)
  @Max(2147483647)
  orderLineId?: number | null;

  @ApiProperty({ description: 'Quantity, up to 3 decimals', minimum: 0.001 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Quantity must be a number with at most 3 decimals.' },
  )
  @Min(0.001, { message: 'Quantity must be greater than 0.' })
  @Max(MAX_QUANTITY, { message: 'Quantity is too large.' })
  quantity: number;
}

export class StockIssueLineDto extends OrderStockLineDto {
  @ApiPropertyOptional({
    description:
      'Why more than the BOM is issued; required on every line of an item once the order’s issues exceed its demand',
    maxLength: MAX_TEXT_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  reason?: string | null;
}

export class WorkshopReturnLineDto extends OrderStockLineDto {
  @ApiPropertyOptional({ maxLength: MAX_TEXT_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  note?: string | null;
}

class OrderStockDocumentDto {
  @ApiProperty({ description: 'Sales order' })
  @Type(() => Number)
  @IsInt({ message: 'Order is required.' })
  @Min(1, { message: 'Order is required.' })
  @Max(2147483647, { message: 'Order is required.' })
  orderId: number;

  @ApiPropertyOptional({
    description:
      'One key per screen: posting it again returns the first document with 200 and posts nothing.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Request key must be a UUID.' })
  requestKey?: string;

  @ApiPropertyOptional({ maxLength: MAX_TEXT_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  note?: string | null;
}

export class CreateStockIssueDto extends OrderStockDocumentDto {
  @ApiProperty({ type: [StockIssueLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'An issue needs at least one line.' })
  @ArrayMaxSize(STOCK_ISSUE_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => StockIssueLineDto)
  lines: StockIssueLineDto[];
}

export class CreateWorkshopReturnDto extends OrderStockDocumentDto {
  @ApiProperty({ type: [WorkshopReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A return needs at least one line.' })
  @ArrayMaxSize(STOCK_ISSUE_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => WorkshopReturnLineDto)
  lines: WorkshopReturnLineDto[];
}
