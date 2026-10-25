import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  MAX_MARGIN_PERCENT,
  MAX_QUOTATION_AMOUNT,
  MAX_TERM_LENGTH,
  MAX_TERMS,
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

  @ApiPropertyOptional({
    type: [String],
    description:
      'The numbered terms printed under the table; replaces the whole list',
    maxItems: MAX_TERMS,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TERMS, {
    message: `At most ${MAX_TERMS} terms are allowed.`,
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((term: unknown) =>
          typeof term === 'string' ? term.trim() : term,
        )
      : value,
  )
  @IsString({ each: true, message: 'A term must be text.' })
  @MinLength(1, { each: true, message: 'A term must not be empty.' })
  @MaxLength(MAX_TERM_LENGTH, {
    each: true,
    message: `A term must not exceed ${MAX_TERM_LENGTH} characters.`,
  })
  terms?: string[];
}
