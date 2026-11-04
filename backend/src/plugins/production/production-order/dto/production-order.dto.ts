import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  registerDecorator,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

export class CreateProductionOrderDto {
  @ApiProperty({ description: 'The open sales order to build' })
  @Type(() => Number)
  @IsInt({ message: 'Order is required.' })
  @Min(1, { message: 'Order is required.' })
  @Max(2147483647, { message: 'Order is required.' })
  orderId: number;
}

/** One check, so a bad id answers one message rather than one per rule. */
function IsUserId() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUserId',
      target: object.constructor,
      propertyName,
      options: { message: 'Assignee must be a user id.' },
      validator: {
        validate: (value: unknown) =>
          Number.isInteger(value) &&
          (value as number) >= 1 &&
          (value as number) <= 2147483647,
      },
    });
  };
}

/**
 * The assignment of one cabinet; a field left out stays as it is. Null is refused rather than
 * skipped: a released cabinet must keep a technician and a planned end date.
 */
export class UpdateProductionUnitDto {
  @ApiPropertyOptional({ description: 'Account holding the technician role' })
  @ValidateIf((o: UpdateProductionUnitDto) => o.assigneeId !== undefined)
  @Type(() => Number)
  @IsUserId()
  assigneeId?: number;

  @ApiPropertyOptional({
    description: 'Planned end date, YYYY-MM-DD',
    example: '2026-12-31',
  })
  @ValidateIf((o: UpdateProductionUnitDto) => o.plannedEndDate !== undefined)
  @IsDateOnly()
  // A year still being typed (0002) parses as a date; no cabinet is due before 2000 or after 2999.
  @Matches(/^2\d{3}-/, {
    message: 'Planned end date must fall between the years 2000 and 2999.',
  })
  plannedEndDate?: string;
}

/** Why a production order is cancelled. */
export class ProductionOrderReasonDto {
  @ApiProperty({ maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Reason is required.' })
  @MinLength(1, { message: 'Reason is required.' })
  @MaxLength(1000, { message: 'Reason must not exceed 1000 characters.' })
  reason: string;
}
