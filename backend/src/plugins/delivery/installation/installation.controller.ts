import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
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
  CreateInstallationDto,
  InstallationFilterDto,
  UpdateInstallationDto,
} from '@plugins/delivery/installation/dto/installation.dto';
import {
  INSTALLATION_MANAGE,
  INSTALLATION_READ,
} from '@plugins/delivery/installation/permissions/installation.permissions';
import { InstallationQueryService } from '@plugins/delivery/installation/services/installation-query.service';
import { InstallationService } from '@plugins/delivery/installation/services/installation.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('delivery/installation')
@ApiBearerAuth()
@Controller('delivery')
export class InstallationController {
  constructor(
    private readonly installations: InstallationService,
    private readonly queries: InstallationQueryService,
  ) {}

  @Post('orders/:orderId/installation')
  @RequirePermission(INSTALLATION_MANAGE)
  @ApiOperation({
    summary: 'Plan the installation of an order at the project',
    description:
      'At most one per order, while the order is in production or delivered. The address defaults to the project site address, else the customer address.',
  })
  @ApiParam({ name: 'orderId', type: Number })
  @ApiBody({ type: CreateInstallationDto })
  @ApiResponse({ status: 201, description: 'The installation, as planned' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires installation:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'No such order in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description: 'The order is not in production or delivered, or has one',
  })
  create(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CreateInstallationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.installations.create(orderId, dto, user);
  }

  @Get('installations')
  @RequirePermission(INSTALLATION_READ)
  @ApiOperation({ summary: 'List installations' })
  @ApiResponse({ status: 200, description: 'A page of installations' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires installation:read',
  })
  list(
    @Query() query: InstallationFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.list(query, user);
  }

  @Get('installations/:id')
  @RequirePermission(INSTALLATION_READ)
  @ApiOperation({ summary: 'One installation with its photos' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The installation' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires installation:read',
  })
  @ApiResponse({
    status: 404,
    description: 'No such installation in the caller’s scope',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.get(id, user);
  }

  @Patch('installations/:id')
  @RequirePermission(INSTALLATION_MANAGE)
  @ApiOperation({
    summary: 'Edit an installation that is not done',
    description:
      'An absent field stays, an empty text clears it. Refused while the order is not in production or delivered.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateInstallationDto })
  @ApiResponse({ status: 200, description: 'The installation' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires installation:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'No such installation in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description: 'The installation is done or the order is not writable',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstallationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.installations.update(id, dto, user);
  }

  @Post('installations/:id/start')
  @HttpCode(200)
  @RequirePermission(INSTALLATION_MANAGE)
  @ApiOperation({ summary: 'Start a planned installation' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The installation, in progress' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires installation:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'No such installation in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description: 'The installation is not planned or the order is not writable',
  })
  start(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.installations.start(id, user);
  }

  @Post('installations/:id/finish')
  @HttpCode(200)
  @RequirePermission(INSTALLATION_MANAGE)
  @ApiOperation({ summary: 'Finish an installation in progress' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The installation, done' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires installation:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'No such installation in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description:
      'The installation is not in progress or the order is not writable',
  })
  finish(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.installations.finish(id, user);
  }
}
