import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

import { MAX_UNIT_COST } from '@plugins/sales/estimate/constants/estimate.constant';

/** The cost sales fills on a BOM line of a submitted revision. */
export class PriceBomLineDto {
  @ApiProperty({
    description: 'Cost of one unit in VND, up to 2 decimals',
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Unit cost must be a number with at most 2 decimals.' },
  )
  @Min(0, { message: 'Unit cost must not be negative.' })
  @Max(MAX_UNIT_COST, { message: 'Unit cost is too large.' })
  unitCost: number;
}
