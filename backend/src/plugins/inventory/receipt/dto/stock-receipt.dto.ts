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

import { STOCK_RECEIPT_MAX_LINES } from '@plugins/inventory/receipt/constants/receipt.constant';

const MAX_QUANTITY = 1_000_000;
const MAX_NOTE_LENGTH = 2000;

export class StockReceiptLineDto {
  @ApiProperty({ description: 'Line of the purchase order being received' })
  @Type(() => Number)
  @IsInt({ message: 'Purchase order line is required.' })
  @Min(1, { message: 'Purchase order line is required.' })
  @Max(2147483647, { message: 'Purchase order line is required.' })
  poLineId: number;

  @ApiProperty({
    description: 'Quantity received, up to 3 decimals',
    minimum: 0.001,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Quantity must be a number with at most 3 decimals.' },
  )
  @Min(0.001, { message: 'Quantity must be greater than 0.' })
  @Max(MAX_QUANTITY, { message: 'Quantity is too large.' })
  quantity: number;
}

export class CreateStockReceiptDto {
  @ApiProperty({ description: 'Approved or partly received purchase order' })
  @Type(() => Number)
  @IsInt({ message: 'Purchase order is required.' })
  @Min(1, { message: 'Purchase order is required.' })
  @Max(2147483647, { message: 'Purchase order is required.' })
  purchaseOrderId: number;

  @ApiPropertyOptional({
    description:
      'One key per receive screen: posting it again returns the first receipt with 200 and posts nothing.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Request key must be a UUID.' })
  requestKey?: string;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string | null;

  @ApiProperty({ type: [StockReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A receipt needs at least one line.' })
  @ArrayMaxSize(STOCK_RECEIPT_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptLineDto)
  lines: StockReceiptLineDto[];
}
