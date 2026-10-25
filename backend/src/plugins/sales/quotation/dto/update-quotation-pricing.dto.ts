import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  MAX_MARGIN_PERCENT,
  MAX_QUOTATION_AMOUNT,
  VAT_RATES,
} from '@plugins/sales/quotation/constants/quotation.constant';
import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';

export class LineMarginDto {
  @ApiProperty({ description: 'The quotation line (one estimate panel)' })
  @Type(() => Number)
  @IsInt({ message: 'Line is required.' })
  @Min(1, { message: 'Line is required.' })
  lineId: number;

  @ApiProperty({
    description:
      'Margin over the panel cost, percent, 0–1000, up to 2 decimals',
    minimum: 0,
    maximum: MAX_MARGIN_PERCENT,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Margin must be a number with at most 2 decimals.' },
  )
  @Min(0, { message: 'Margin must not be negative.' })
  @Max(MAX_MARGIN_PERCENT, {
    message: `Margin must not exceed ${MAX_MARGIN_PERCENT}%.`,
  })
  marginPercent: number;
}

/** Everything is optional: only what is sent changes. Totals are never an input. */
export class UpdateQuotationPricingDto {
  @ApiPropertyOptional({ type: [LineMarginDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LineMarginDto)
  lines?: LineMarginDto[];

  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType, { message: 'Discount type must be percent or amount.' })
  discountType?: DiscountType;

  @ApiPropertyOptional({
    description:
      'Percent (0–100) or VND per the discount type, up to 2 decimals; the cap per type is checked by the server',
    minimum: 0,
    maximum: MAX_QUOTATION_AMOUNT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Discount must be a number with at most 2 decimals.' },
  )
  @Min(0, { message: 'Discount must not be negative.' })
  @Max(MAX_QUOTATION_AMOUNT, { message: 'Discount is too large.' })
  discountValue?: number;

  @ApiPropertyOptional({ enum: VAT_RATES })
  @IsOptional()
  @Type(() => Number)
  @IsIn(VAT_RATES, { message: 'VAT must be 0, 5, 8 or 10 percent.' })
  vatRate?: number;
}
