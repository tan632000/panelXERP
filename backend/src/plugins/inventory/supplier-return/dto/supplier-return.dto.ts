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

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import { SUPPLIER_RETURN_MAX_LINES } from '@plugins/inventory/supplier-return/constants/supplier-return.constant';

const MAX_QUANTITY = 1_000_000;
const MAX_REASON_LENGTH = 2000;

export class SupplierReturnLineDto {
  @ApiProperty({ description: 'Line of the purchase order the goods came on' })
  @Type(() => Number)
  @IsInt({ message: 'Purchase order line is required.' })
  @Min(1, { message: 'Purchase order line is required.' })
  @Max(2147483647, { message: 'Purchase order line is required.' })
  poLineId: number;

  @ApiProperty({
    description: 'Quantity returned, up to 3 decimals',
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

export class CreateSupplierReturnDto {
  @ApiProperty({ description: 'Purchase order goods were received on' })
  @Type(() => Number)
  @IsInt({ message: 'Purchase order is required.' })
  @Min(1, { message: 'Purchase order is required.' })
  @Max(2147483647, { message: 'Purchase order is required.' })
  purchaseOrderId: number;

  @ApiPropertyOptional({
    description:
      'One key per return screen: posting it again returns the first return with 200 and posts nothing.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Request key must be a UUID.' })
  requestKey?: string;

  @ApiProperty({
    description: 'Why the goods go back',
    maxLength: MAX_REASON_LENGTH,
  })
  @IsString({ message: 'Reason is required.' })
  @MaxLength(MAX_REASON_LENGTH)
  reason: string;

  @ApiProperty({ type: [SupplierReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A return needs at least one line.' })
  @ArrayMaxSize(SUPPLIER_RETURN_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => SupplierReturnLineDto)
  lines: SupplierReturnLineDto[];
}

export class SupplierReturnFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Only the returns of this purchase order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  purchaseOrderId?: number;
}
