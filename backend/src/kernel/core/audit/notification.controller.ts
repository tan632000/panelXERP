import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  DEFAULT_NOTIFICATION_PAGE_SIZE,
  NotificationService,
} from '@kernel/core/audit/notification.service';
import { CurrentUser } from '@kernel/core/auth/decorators/auth.decorators';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const MAX_LIST_LIMIT = 100;

/** Page size the caller asked for, bounded; the service default when unusable. */
function parsePageSize(limit?: string): number {
  const parsed = Number(limit);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.trunc(parsed), MAX_LIST_LIMIT)
    : DEFAULT_NOTIFICATION_PAGE_SIZE;
}

/** Continuation anchor, or null to start from the newest record. */
function parseCursor(cursor?: string): number | null {
  const parsed = Number(cursor);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

/**
 * In-app notifications for the calling user.
 *
 * No route declares a permission: every authenticated actor may call these, and the
 * service withholds any record whose addressed roles or required scope the actor lacks.
 * An actor with no readable record simply gets an empty list and a zero count.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List notifications addressed to the current user',
    description:
      'One keyset page, newest first, each row carrying the read flag of the calling ' +
      'user only. Send the returned `nextCursor` back as `cursor` for the next page; a ' +
      'null `nextCursor` means there is nothing older left.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: Number,
    description: 'Id of the last row of the previous page',
  })
  @ApiResponse({ status: 200, description: 'One page for this user' })
  findAll(
    @CurrentUser() user: AuthUserPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.listForActor(
      { userId: user.userId, permissions: user.permissions },
      parsePageSize(limit),
      parseCursor(cursor),
    );
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Count notifications this user has neither read nor seen closed',
  })
  unreadCount(@CurrentUser() user: AuthUserPayload) {
    return this.service
      .unreadCountForActor({
        userId: user.userId,
        permissions: user.permissions,
      })
      .then((count) => ({ count }));
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark every notification of this user read' })
  markAllRead(@CurrentUser() user: AuthUserPayload) {
    return this.service.markAllRead({
      userId: user.userId,
      permissions: user.permissions,
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification read for this user' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: 403,
    description: 'Notification is not addressed to this user',
  })
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.markRead(
      { userId: user.userId, permissions: user.permissions },
      id,
    );
  }
}
