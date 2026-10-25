import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_PANEL_QUANTITY,
  MAX_TAG_LENGTH,
} from '@plugins/sales/estimate/constants/estimate.constant';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePanelDto {
  @ApiProperty({
    description: 'Panel tag, unique within the revision',
    example: 'MSB-01',
    maxLength: MAX_TAG_LENGTH,
  })
  @Transform(trim)
  @IsString({ message: 'Tag is required.' })
  @MinLength(1, { message: 'Tag is required.' })
  @MaxLength(MAX_TAG_LENGTH, {
    message: `Tag must not exceed ${MAX_TAG_LENGTH} characters.`,
  })
  tag: string;

  @ApiPropertyOptional({
    description: 'Description',
    maxLength: MAX_DESCRIPTION_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string.' })
  @MaxLength(MAX_DESCRIPTION_LENGTH, {
    message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
  })
  description?: string | null;

  @ApiProperty({
    description: 'How many identical panels are built',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1, { message: 'Quantity must be at least 1.' })
  @Max(MAX_PANEL_QUANTITY, { message: 'Quantity is too large.' })
  quantity: number;
}

export class UpdatePanelDto extends PartialType(CreatePanelDto) {}
