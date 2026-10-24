import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { IsMasterDataCode } from '@shared/decorators/is-master-data-code.decorator';

import { PROJECT_CODE_PREFIX } from '@plugins/crm/project/constants/project-code.constant';

export class CreateProjectDto {
  @ApiProperty({
    description: 'Project code (DA_xxxx)',
    maxLength: 30,
    example: 'DA_0001',
  })
  @IsMasterDataCode(PROJECT_CODE_PREFIX, {
    label: 'Project code',
    maxLength: 30,
  })
  code: string;

  @ApiProperty({ description: 'Customer the project belongs to' })
  @Type(() => Number)
  @IsInt({ message: 'Customer is required.' })
  @Min(1, { message: 'Customer is required.' })
  customerId: number;

  @ApiProperty({ description: 'Project name', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Project name is required.' })
  @MinLength(1, { message: 'Project name is required.' })
  @MaxLength(255, { message: 'Project name must not exceed 255 characters.' })
  name: string;

  @ApiPropertyOptional({ description: 'Site address', maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'Site address must be a string.' })
  @MaxLength(500, { message: 'Site address must not exceed 500 characters.' })
  siteAddress?: string;

  @ApiPropertyOptional({ description: 'Note', maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(2000, { message: 'Note must not exceed 2000 characters.' })
  note?: string;
}
