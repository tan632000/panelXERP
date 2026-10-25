import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';

/** Status an estimate shows in a list: that of its latest revision. */
export const ESTIMATE_LIST_STATUSES = [
  EstimateRevisionStatus.DRAFT,
  EstimateRevisionStatus.SUBMITTED,
] as const;

export type EstimateListStatus = (typeof ESTIMATE_LIST_STATUSES)[number];

export class EstimateFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    enum: ESTIMATE_LIST_STATUSES,
    description: 'Status of the latest revision',
  })
  @IsOptional()
  @IsEnum(ESTIMATE_LIST_STATUSES)
  status?: EstimateListStatus;

  @ApiPropertyOptional({ description: 'Only the estimate of this request' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestId?: number;

  @ApiPropertyOptional({
    description: 'Only estimates of requests assigned to this engineer',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedEngineerId?: number;
}
