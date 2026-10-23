import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_FIELDS_PER_COLUMN,
  EXCEL_MAX_HEADER_GROUP_DEPTH,
} from '@shared/constants/excel';

export const EXCEL_FIELD_TYPES = ['text', 'number', 'date'] as const;
export type ExcelFieldType = (typeof EXCEL_FIELD_TYPES)[number];

export const EXCEL_COMBINE_MODES = ['join', 'coalesce'] as const;
export type ExcelCombineMode = (typeof EXCEL_COMBINE_MODES)[number];

/** Row field names and column keys: plain identifiers, never a path into the row. */
const FIELD_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** An Excel number format built only from digit placeholders, separators, `%`, quotes and letters. */
const NUMBER_FORMAT_PATTERN = /^[#0,.%" A-Za-z]{1,32}$/;

/** Excel rejects these characters in a worksheet name. */
const SHEET_NAME_PATTERN = /^[^[\]:*?/\\]{1,31}$/;

/** One row field a column reads, and how its raw value is written. */
export class ExcelFieldRefDto {
  @ApiProperty({ description: 'Row field name', example: 'orderDate' })
  @IsString()
  @Matches(FIELD_NAME_PATTERN)
  field!: string;

  @ApiPropertyOptional({ enum: EXCEL_FIELD_TYPES, default: 'text' })
  @IsOptional()
  @IsIn(EXCEL_FIELD_TYPES)
  type?: ExcelFieldType;

  @ApiPropertyOptional({
    description: 'Display label per stored value, e.g. an enum member',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  valueLabels?: Record<string, string>;
}

/** One exported column: its display label, header group path and value source. */
export class ExcelColumnSpecDto {
  @ApiProperty({ description: 'Column key', example: 'orderCode' })
  @IsString()
  @Matches(FIELD_NAME_PATTERN)
  key!: string;

  @ApiProperty({ description: 'Display label drawn in the header' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({
    description: 'Header group labels, outermost first',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EXCEL_MAX_HEADER_GROUP_DEPTH)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  headerGroup?: string[];

  @ApiPropertyOptional({ type: [ExcelFieldRefDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EXCEL_MAX_FIELDS_PER_COLUMN)
  @ValidateNested({ each: true })
  @Type(() => ExcelFieldRefDto)
  fields?: ExcelFieldRefDto[];

  @ApiPropertyOptional({ enum: EXCEL_COMBINE_MODES, default: 'join' })
  @IsOptional()
  @IsIn(EXCEL_COMBINE_MODES)
  combine?: ExcelCombineMode;

  @ApiPropertyOptional({ description: 'Separator for `join`', default: ' ' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  joinWith?: string;

  @ApiPropertyOptional({ description: 'Excel number format, e.g. #,##0.00' })
  @IsOptional()
  @IsString()
  @Matches(NUMBER_FORMAT_PATTERN)
  numberFormat?: string;

  @ApiPropertyOptional({
    description: 'Write once per row group and merge across the group',
  })
  @IsOptional()
  @IsBoolean()
  groupSpan?: boolean;

  @ApiPropertyOptional({ description: 'Column width in Excel characters' })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(80)
  width?: number;

  @ApiPropertyOptional({
    description: 'Whether this column must hold a value on every import row',
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

/** The serialized layout of one table, as the list screen shows it (contract C1). */
export class ExcelSheetSpecDto {
  @ApiProperty({ type: [ExcelColumnSpecDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EXCEL_MAX_COLUMNS)
  @ValidateNested({ each: true })
  @Type(() => ExcelColumnSpecDto)
  columns!: ExcelColumnSpecDto[];

  @ApiPropertyOptional({
    description: 'Row field whose consecutive equal values form one record',
  })
  @IsOptional()
  @IsString()
  @Matches(FIELD_NAME_PATTERN)
  rowGroupField?: string;

  @ApiPropertyOptional({ description: 'Worksheet name' })
  @IsOptional()
  @IsString()
  @Matches(SHEET_NAME_PATTERN)
  sheetName?: string;
}

/** One worksheet of a multi-sheet export: which of the source's row sets it writes, and how. */
export class ExcelSheetEntryDto {
  @ApiProperty({
    description: "Key of the source's row set this worksheet writes",
    example: 'monthly',
  })
  @IsString()
  @Matches(FIELD_NAME_PATTERN)
  key!: string;

  @ApiProperty({ type: ExcelSheetSpecDto })
  @ValidateNested()
  @Type(() => ExcelSheetSpecDto)
  sheet!: ExcelSheetSpecDto;
}
