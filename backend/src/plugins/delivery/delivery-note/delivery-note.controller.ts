import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermission,
} from '@kernel/core/auth/decorators/auth.decorators';

import {
  CancelDeliveryNoteDto,
  CreateDeliveryNoteDto,
  DeliveryNoteFilterDto,
} from '@plugins/delivery/delivery-note/dto/delivery-note.dto';
import {
  DELIVERY_NOTE_CANCEL,
  DELIVERY_NOTE_CREATE,
  DELIVERY_NOTE_READ,
  DELIVERY_NOTE_SHIP,
} from '@plugins/delivery/delivery-note/permissions/delivery-note.permissions';
import { DeliveryNoteQueryService } from '@plugins/delivery/delivery-note/services/delivery-note-query.service';
import { DeliveryNoteService } from '@plugins/delivery/delivery-note/services/delivery-note.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('delivery/delivery-note')
@ApiBearerAuth()
@Controller('delivery')
export class DeliveryNoteController {
  constructor(
    private readonly notes: DeliveryNoteService,
    private readonly queries: DeliveryNoteQueryService,
  ) {}

  @Get('orders/deliverable')
  @RequirePermission(DELIVERY_NOTE_CREATE)
  @ApiOperation({
    summary: 'Orders with cabinets ready to deliver',
    description:
      'In-production orders in the caller’s scope with at least one QC-passed cabinet on no live delivery note.',
  })
  @ApiResponse({ status: 200, description: 'Order code, customer and project' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:create',
  })
  listDeliverableOrders(@CurrentUser() user: AuthUserPayload) {
    return this.queries.listDeliverableOrders(user);
  }

  @Get('orders/:orderId')
  @RequirePermission(DELIVERY_NOTE_READ)
  @ApiOperation({
    summary: 'One order’s delivery page',
    description:
      'Cabinets with their QC and delivery status, the delivery notes, and the prefilled address.',
  })
  @ApiParam({ name: 'orderId', type: Number })
  @ApiResponse({ status: 200, description: 'The order’s cabinets and notes' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:read',
  })
  @ApiResponse({
    status: 404,
    description: 'No such order in the caller’s scope',
  })
  getOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.getOrder(orderId, user);
  }

  @Get('notes')
  @RequirePermission(DELIVERY_NOTE_READ)
  @ApiOperation({ summary: 'List delivery notes' })
  @ApiResponse({ status: 200, description: 'A page of delivery notes' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:read',
  })
  list(
    @Query() query: DeliveryNoteFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.listNotes(query, user);
  }

  @Get('notes/:id')
  @RequirePermission(DELIVERY_NOTE_READ)
  @ApiOperation({ summary: 'One delivery note with its cabinets and files' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The delivery note' })
  @ApiResponse({
    status: 404,
    description: 'No such delivery note in the caller’s scope',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.getNote(id, user);
  }

  @Post('notes')
  @RequirePermission(DELIVERY_NOTE_CREATE)
  @ApiOperation({
    summary: 'Create a delivery note',
    description:
      'PGH_YYYY_NNNN from QC-passed cabinets of one in-production order that are on no live note.',
  })
  @ApiBody({ type: CreateDeliveryNoteDto })
  @ApiResponse({ status: 201, description: 'The delivery note, as a draft' })
  @ApiResponse({
    status: 400,
    description: 'A cabinet is not of the order, not QC-passed, or on a note',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:create',
  })
  @ApiResponse({
    status: 404,
    description: 'No such order in the caller’s scope',
  })
  @ApiResponse({ status: 409, description: 'The order is not in production' })
  create(
    @Body() dto: CreateDeliveryNoteDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.notes.create(dto, user);
  }

  @Post('notes/:id/ship')
  @HttpCode(200)
  @RequirePermission(DELIVERY_NOTE_SHIP)
  @ApiOperation({ summary: 'Ship a draft delivery note' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The shipped delivery note' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:ship',
  })
  @ApiResponse({
    status: 404,
    description: 'No such delivery note in the caller’s scope',
  })
  @ApiResponse({ status: 409, description: 'The note is not a draft' })
  ship(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.notes.ship(id, user);
  }

  @Post('notes/:id/cancel')
  @HttpCode(200)
  @RequirePermission(DELIVERY_NOTE_CANCEL)
  @ApiOperation({
    summary: 'Cancel a draft or shipped delivery note',
    description: 'Frees its cabinets for another note at once.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CancelDeliveryNoteDto })
  @ApiResponse({ status: 200, description: 'The cancelled delivery note' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:cancel',
  })
  @ApiResponse({
    status: 404,
    description: 'No such delivery note in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description: 'The note is received or cancelled',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelDeliveryNoteDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.notes.cancel(id, dto, user);
  }
}
