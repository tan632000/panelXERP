import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsMasterDataCode } from '@shared/decorators/is-master-data-code.decorator';
import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';

import {
  MAX_BOM_QUANTITY,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PANEL_QUANTITY,
  MAX_TAG_LENGTH,
} from '@plugins/sales/estimate/constants/estimate.constant';

const QUOTATION_TEMPLATE_CODE_PREFIX = 'TPL_';
/** Bounds of one body; the largest seeded template holds 8 panels and 127 lines. */
const MAX_TEMPLATE_PANELS = 200;
const MAX_TEMPLATE_LINES_PER_PANEL = 1_000;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** `?isActive=true|false` arrives as a string; anything else is left for the validator to refuse. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class TemplateLineDto {
  @ApiProperty({ description: 'Catalog item' })
  @Type(() => Number)
  @IsInt({ message: 'Item is required.' })
  @Min(1, { message: 'Item is required.' })
  itemId: number;

  @ApiProperty({ description: 'Quantity, up to 3 decimals', minimum: 0.001 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Quantity must be a number with at most 3 decimals.' },
  )
  @Min(0.001, { message: 'Quantity must be greater than 0.' })
  @Max(MAX_BOM_QUANTITY, { message: 'Quantity is too large.' })
  quantity: number;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @IsString({ message: 'Group label must be a string.' })
  @MaxLength(255, { message: 'Group label must not exceed 255 characters.' })
  groupLabel?: string | null;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, nullable: true })
  @IsOptional()
  @IsString({ message: 'Note must be a string.' })
  @MaxLength(MAX_NOTE_LENGTH, {
    message: `Note must not exceed ${MAX_NOTE_LENGTH} characters.`,
  })
  note?: string | null;
}

export class TemplatePanelDto {
  @ApiProperty({
    description: 'Panel tag, unique within the template',
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

  @ApiPropertyOptional({ maxLength: MAX_DESCRIPTION_LENGTH, nullable: true })
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

  @ApiProperty({ type: [TemplateLineDto] })
  @IsArray({ message: 'Lines must be a list.' })
  @ArrayMaxSize(MAX_TEMPLATE_LINES_PER_PANEL, {
    message: `A panel holds at most ${MAX_TEMPLATE_LINES_PER_PANEL} lines.`,
  })
  @ValidateNested({ each: true })
  @Type(() => TemplateLineDto)
  lines: TemplateLineDto[];
}

export class CreateQuotationTemplateDto {
  @ApiProperty({
    description: 'Template code (TPL_xxxx)',
    maxLength: 30,
    example: 'TPL_0006',
  })
  @IsMasterDataCode(QUOTATION_TEMPLATE_CODE_PREFIX, {
    label: 'Template code',
    maxLength: 30,
  })
  code: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString({ message: 'Template name is required.' })
  @MinLength(1, { message: 'Template name is required.' })
  @MaxLength(255, { message: 'Template name must not exceed 255 characters.' })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Description must be a string.' })
  @MaxLength(2000, { message: 'Description must not exceed 2000 characters.' })
  description?: string | null;

  @ApiProperty({ type: [TemplatePanelDto] })
  @IsArray({ message: 'Panels must be a list.' })
  @ArrayMaxSize(MAX_TEMPLATE_PANELS, {
    message: `A template holds at most ${MAX_TEMPLATE_PANELS} panels.`,
  })
  @ValidateNested({ each: true })
  @Type(() => TemplatePanelDto)
  panels: TemplatePanelDto[];
}

/** The code is fixed: a body that echoes it back is accepted, a different one is a 400. */
export class UpdateQuotationTemplateDto extends PartialType(
  CreateQuotationTemplateDto,
) {}

export class QuotationTemplateFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Only active or only inactive templates',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}
