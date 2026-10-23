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

/** Longest key a row may be addressed by: a business code, or a composite line key. */
const MAX_BULK_APPROVE_KEY_LENGTH = 300;

/** Ids ticked in a list table, sent as one bulk-approve request. */
export class BulkApproveDto {
  @ApiProperty({
    isArray: true,
    type: Number,
    description: `Ids of the rows to approve (1–${MAX_BULK_DELETE_IDS})`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_DELETE_IDS)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];
}

/**
 * The same request for rows addressed by a string key: a business code, or a composite such
 * as `<receiptId>:<lineIndex>:<sequence>` for a line-level approval.
 */
export class BulkApproveKeysDto {
  @ApiProperty({
    isArray: true,
    type: String,
    description: `Keys of the rows to approve (1–${MAX_BULK_DELETE_IDS})`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_DELETE_IDS)
  @IsString({ each: true })
  @MaxLength(MAX_BULK_APPROVE_KEY_LENGTH, { each: true })
  ids!: string[];
}
