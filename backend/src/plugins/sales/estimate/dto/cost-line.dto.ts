import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  MAX_COST_LINE_AMOUNT,
  MAX_DESCRIPTION_LENGTH,
} from '@plugins/sales/estimate/constants/estimate.constant';
import { CostCategory } from '@plugins/sales/estimate/enums/cost-category.enum';

export class CreateCostLineDto {
  @ApiProperty({ enum: CostCategory })
  @IsEnum(CostCategory, { message: 'Category is not valid.' })
  category: CostCategory;

  @ApiPropertyOptional({ maxLength: MAX_DESCRIPTION_LENGTH, nullable: true })
  @IsOptional()
  @IsString({ message: 'Description must be a string.' })
  @MaxLength(MAX_DESCRIPTION_LENGTH, {
    message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
  })
  description?: string | null;

  @ApiProperty({
    description: 'Cost for ONE panel, whole VND',
    minimum: 0,
    type: Number,
  })
  @Type(() => Number)
  @IsInt({ message: 'Amount must be a whole number of VND.' })
  @Min(0, { message: 'Amount must not be negative.' })
  @Max(MAX_COST_LINE_AMOUNT, { message: 'Amount is too large.' })
  amount: number;
}

export class UpdateCostLineDto extends PartialType(CreateCostLineDto) {}
