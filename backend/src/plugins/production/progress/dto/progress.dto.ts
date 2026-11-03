import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import {
  ProductionStage,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';

export class ProductionUnitFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Only the cabinets assigned to the caller',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'mine must be true or false.' })
  mine?: boolean;

  @ApiPropertyOptional({
    description: 'Only the cabinets of this production order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productionOrderId?: number;

  @ApiPropertyOptional({
    enum: ProductionStageStatus,
    description:
      'Status of the current stage: the first one not done. `done` means every stage is done.',
  })
  @IsOptional()
  @IsEnum(ProductionStageStatus, { message: 'Unknown stage status.' })
  stageStatus?: ProductionStageStatus;
}

/** Why the latest finished stage is taken back. */
export class StageUndoDto {
  @ApiProperty({ maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Reason is required.' })
  @MinLength(1, { message: 'Reason is required.' })
  @MaxLength(1000, { message: 'Reason must not exceed 1000 characters.' })
  reason: string;
}

/** The text fields beside the `file` of a photo upload. */
export class UploadPhotoDto {
  @ApiProperty({ enum: ProductionStage })
  @IsEnum(ProductionStage, { message: 'Unknown stage.' })
  stage: ProductionStage;

  @ApiPropertyOptional({
    description: 'An issue of the same cabinet this photo documents',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  issueId?: number;
}
