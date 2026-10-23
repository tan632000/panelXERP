import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  MaxLength,
} from 'class-validator';

import { MAX_BULK_DELETE_IDS } from '@shared/constants/pagination';

/** Longest business code a row may be addressed by, matching the widest code column. */
const MAX_BULK_DELETE_CODE_LENGTH = 300;

/** Ids ticked in a list table, sent as one bulk-delete request. */
export class BulkDeleteDto {
  @ApiProperty({
    isArray: true,
    type: Number,
    description: `Ids of the rows to delete (1–${MAX_BULK_DELETE_IDS})`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_DELETE_IDS)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];
}

/**
 * The same request for a resource whose rows are addressed by a business code rather than a
 * numeric key, so the ids must survive the trip as the strings they are.
 */
export class BulkDeleteCodesDto {
  @ApiProperty({
    isArray: true,
    type: String,
    description: `Business codes of the rows to delete (1–${MAX_BULK_DELETE_IDS})`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_DELETE_IDS)
  @IsString({ each: true })
  @MaxLength(MAX_BULK_DELETE_CODE_LENGTH, { each: true })
  ids!: string[];
}
