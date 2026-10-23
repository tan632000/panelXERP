import {
  Body,
  Controller,
  Delete,
  Get,
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

import { ContactFilterDto } from '@plugins/crm/contact/dto/contact-filter.dto';
import { CreateContactDto } from '@plugins/crm/contact/dto/create-contact.dto';
import { UpdateContactDto } from '@plugins/crm/contact/dto/update-contact.dto';
import {
  CONTACT_CREATE,
  CONTACT_DELETE,
  CONTACT_READ,
  CONTACT_UPDATE,
} from '@plugins/crm/contact/permissions/contact.permissions';
import { ContactService } from '@plugins/crm/contact/services/contact.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('crm/contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactController {
  constructor(private readonly service: ContactService) {}

  @Get()
  @RequirePermission(CONTACT_READ)
  @ApiOperation({
    summary: 'List contacts',
    description:
      'Paginated contact list, optionally of one customer. Contacts follow their customer: a Sales actor sees only the contacts of customers they own.',
  })
  @ApiResponse({ status: 200, description: 'Paginated contact list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires contact:read',
  })
  findAll(
    @Query() query: ContactFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(CONTACT_READ)
  @ApiOperation({ summary: 'Get contact by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Contact found' })
  @ApiResponse({
    status: 404,
    description: 'Not found or its customer is owned by another sales account',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(CONTACT_CREATE)
  @ApiOperation({
    summary: 'Create contact',
    description:
      'Adds a contact to a customer. Marking it primary demotes the customer’s previous primary contact.',
  })
  @ApiBody({ type: CreateContactDto })
  @ApiResponse({ status: 201, description: 'Contact created' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires contact:create',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  create(@Body() dto: CreateContactDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(CONTACT_UPDATE)
  @ApiOperation({ summary: 'Update contact' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateContactDto })
  @ApiResponse({ status: 200, description: 'Contact updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires contact:update',
  })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission(CONTACT_DELETE)
  @ApiOperation({ summary: 'Soft-delete contact' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Contact soft-deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires contact:delete',
  })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, user);
  }
}
