import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';
import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import {
  INSTALLATION_NOTE_MAX,
  InstallationStatus,
  PERSON_IN_CHARGE_MAX,
  SITE_ADDRESS_MAX,
} from '@plugins/delivery/installation/constants/installation.constant';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** The editable fields; an empty text clears the field, an absent one leaves it. */
export class UpdateInstallationDto {
  @ApiPropertyOptional({
    maxLength: SITE_ADDRESS_MAX,
    description:
      'On create, defaults to the project site address, else the customer address',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SITE_ADDRESS_MAX, {
    message: `Address must not exceed ${SITE_ADDRESS_MAX} characters.`,
  })
  siteAddress?: string;

  @ApiPropertyOptional({ example: '2026-12-10' })
  @IsOptional()
  @IsDateOnly()
  plannedDate?: string;

  @ApiPropertyOptional({
    maxLength: PERSON_IN_CHARGE_MAX,
    description: 'Free text',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(PERSON_IN_CHARGE_MAX, {
    message: `Person in charge must not exceed ${PERSON_IN_CHARGE_MAX} characters.`,
  })
  personInCharge?: string;

  @ApiPropertyOptional({ maxLength: INSTALLATION_NOTE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(INSTALLATION_NOTE_MAX, {
    message: `Note must not exceed ${INSTALLATION_NOTE_MAX} characters.`,
  })
  note?: string;
}

export class CreateInstallationDto extends UpdateInstallationDto {}

export class InstallationFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: InstallationStatus })
  @IsOptional()
  @IsEnum(InstallationStatus, { message: 'Unknown installation status.' })
  status?: InstallationStatus;

  @ApiPropertyOptional({ description: 'Only the installation of this order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  orderId?: number;
}
