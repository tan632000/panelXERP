import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import {
  QC_NOTE_MAX,
  QcDefectStatus,
  QcItemResult,
  QcUnitStatus,
} from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class QcResultDto {
  @ApiProperty({ description: 'Id of an active checklist template item' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  checklistItemId: number;

  @ApiProperty({ enum: QcItemResult })
  @IsEnum(QcItemResult, { message: 'result must be pass, fail or na.' })
  result: QcItemResult;

  @ApiPropertyOptional({
    maxLength: QC_NOTE_MAX,
    description: 'Required (and becomes the defect) when result is fail',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(QC_NOTE_MAX, {
    message: `Note must not exceed ${QC_NOTE_MAX} characters.`,
  })
  note?: string;
}

export class CreateQcRoundDto {
  @ApiProperty({
    type: [QcResultDto],
    description: 'Exactly one result per active checklist item',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QcResultDto)
  results: QcResultDto[];
}

export class QcUnitFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: QcUnitStatus })
  @IsOptional()
  @IsEnum(QcUnitStatus, { message: 'Unknown QC status.' })
  qcStatus?: QcUnitStatus;

  @ApiPropertyOptional({ description: 'Only the cabinets of this sales order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  orderId?: number;
}

export class QcDefectFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: QcDefectStatus })
  @IsOptional()
  @IsEnum(QcDefectStatus, { message: 'Unknown defect status.' })
  status?: QcDefectStatus;

  @ApiPropertyOptional({ description: 'Only the defects of this cabinet' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  unitId?: number;
}

export class FixQcDefectDto {
  @ApiProperty({ maxLength: QC_NOTE_MAX, description: 'What was done' })
  @Transform(trim)
  @IsString({ message: 'A fix note is required.' })
  @MinLength(1, { message: 'A fix note is required.' })
  @MaxLength(QC_NOTE_MAX, {
    message: `Note must not exceed ${QC_NOTE_MAX} characters.`,
  })
  note: string;
}
