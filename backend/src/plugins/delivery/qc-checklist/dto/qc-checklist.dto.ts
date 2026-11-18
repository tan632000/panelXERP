import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { QC_CHECKLIST_NAME_MAX } from '@plugins/delivery/qc-checklist/constants/qc-checklist.constant';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class QcChecklistFilterDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Also return hidden items; defaults to false',
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'includeHidden must be true or false.' })
  includeHidden?: 'true' | 'false';
}

export class CreateQcChecklistItemDto {
  @ApiProperty({ maxLength: QC_CHECKLIST_NAME_MAX })
  @Transform(trim)
  @IsString({ message: 'Name is required.' })
  @MinLength(1, { message: 'Name is required.' })
  @MaxLength(QC_CHECKLIST_NAME_MAX, {
    message: `Name must not exceed ${QC_CHECKLIST_NAME_MAX} characters.`,
  })
  name: string;
}

export class UpdateQcChecklistItemDto {
  @ApiPropertyOptional({ maxLength: QC_CHECKLIST_NAME_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Name is required.' })
  @MinLength(1, { message: 'Name is required.' })
  @MaxLength(QC_CHECKLIST_NAME_MAX, {
    message: `Name must not exceed ${QC_CHECKLIST_NAME_MAX} characters.`,
  })
  name?: string;

  @ApiPropertyOptional({ description: 'false hides the item from new rounds' })
  @IsOptional()
  @IsBoolean({ message: 'active must be true or false.' })
  active?: boolean;
}

export class ReorderQcChecklistDto {
  @ApiProperty({
    type: [Number],
    description: 'Every item id, hidden ones included, in the new order',
  })
  @IsArray()
  @ArrayUnique({ message: 'ids must not repeat.' })
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  ids: number[];
}
