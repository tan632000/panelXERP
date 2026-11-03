import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
  PRODUCTION_ISSUE_DESCRIPTION_MAX,
  PRODUCTION_ISSUE_RESOLUTION_MAX,
} from '@plugins/production/production-issue/constants/production-issue.constant';
import {
  ProductionIssueSeverity,
  ProductionIssueStatus,
} from '@plugins/production/production-issue/enums/production-issue.enum';
import { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ProductionIssueFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: ProductionIssueStatus })
  @IsOptional()
  @IsEnum(ProductionIssueStatus, { message: 'Unknown issue status.' })
  status?: ProductionIssueStatus;

  @ApiPropertyOptional({
    description: 'Only the issues of this production order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productionOrderId?: number;

  @ApiPropertyOptional({ description: 'Only the issues of this cabinet' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  unitId?: number;
}

export class CreateProductionIssueDto {
  @ApiProperty({ enum: ProductionStage })
  @IsEnum(ProductionStage, { message: 'Unknown stage.' })
  stage: ProductionStage;

  @ApiProperty({ maxLength: PRODUCTION_ISSUE_DESCRIPTION_MAX })
  @Transform(trim)
  @IsString({ message: 'Description is required.' })
  @MinLength(1, { message: 'Description is required.' })
  @MaxLength(PRODUCTION_ISSUE_DESCRIPTION_MAX, {
    message: `Description must not exceed ${PRODUCTION_ISSUE_DESCRIPTION_MAX} characters.`,
  })
  description: string;

  @ApiProperty({ enum: ProductionIssueSeverity })
  @IsEnum(ProductionIssueSeverity, { message: 'Unknown severity.' })
  severity: ProductionIssueSeverity;
}

export class ResolveProductionIssueDto {
  @ApiProperty({ maxLength: PRODUCTION_ISSUE_RESOLUTION_MAX })
  @Transform(trim)
  @IsString({ message: 'Resolution is required.' })
  @MinLength(1, { message: 'Resolution is required.' })
  @MaxLength(PRODUCTION_ISSUE_RESOLUTION_MAX, {
    message: `Resolution must not exceed ${PRODUCTION_ISSUE_RESOLUTION_MAX} characters.`,
  })
  resolution: string;
}
