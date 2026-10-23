import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { CurrentUser } from '@kernel/core/auth/decorators/auth.decorators';
import { ListPreferenceService } from '@kernel/core/users/list-preference.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * Body of a preference write. The user is taken from the token, never from here.
 *
 * The property carries validators because the global pipe whitelists: an undecorated field
 * is not merely unvalidated, it is rejected outright as one the DTO does not declare.
 */
export class UpdateListPreferenceDto {
  @ApiProperty({
    type: [String],
    description: 'Column keys the user leaves visible',
    example: ['customerCode', 'status'],
  })
  @IsArray()
  @IsString({ each: true })
  visibleColumns: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description:
      'Last column pinned while scrolling sideways; null unfreezes, absent keeps the stored choice',
    example: 'customerCode',
  })
  // `IsOptional` lets null through unchecked, which is what "freeze nothing" needs; an
  // absent field is a different instruction and leaves the stored choice untouched.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  frozenColumn?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
    description:
      'Width in pixels of each column the user dragged, keyed by column key; absent keeps the stored widths',
    example: { customerCode: 120, status: 96 },
  })
  // The value range is checked by the service, which owns the width limits.
  @IsOptional()
  @IsObject()
  columnWidths?: Record<string, number>;
}

/**
 * Per-user column visibility of a list screen.
 *
 * Both routes are authenticated but carry no `@RequirePermission`: a preference exposes
 * nothing about the data, only which columns that one account chose to see.
 */
@ApiTags('users/list-preferences')
@ApiBearerAuth()
@Controller('list-preferences')
export class ListPreferenceController {
  constructor(private readonly service: ListPreferenceService) {}

  @Get(':moduleKey')
  @ApiOperation({ summary: "Read the caller's column choice for one list" })
  @ApiParam({ name: 'moduleKey', example: 'rfq_list_v3' })
  @ApiResponse({
    status: 200,
    description: 'Stored choice, or null when unset',
  })
  @ApiResponse({ status: 400, description: 'Unknown module key' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  find(
    @Param('moduleKey') moduleKey: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findForUser(user.userId, moduleKey);
  }

  @Put(':moduleKey')
  @ApiOperation({ summary: "Store the caller's column choice for one list" })
  @ApiParam({ name: 'moduleKey', example: 'rfq_list_v3' })
  @ApiResponse({ status: 200, description: 'Stored choice' })
  @ApiResponse({
    status: 400,
    description: 'Unknown module key or bad columns',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  upsert(
    @Param('moduleKey') moduleKey: string,
    @Body() dto: UpdateListPreferenceDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.upsertForUser(
      user.userId,
      moduleKey,
      dto?.visibleColumns,
      dto?.frozenColumn,
      dto?.columnWidths,
    );
  }
}
