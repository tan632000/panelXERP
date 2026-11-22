import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermission,
} from '@kernel/core/auth/decorators/auth.decorators';

import { buildAttachmentContentDisposition } from '@shared/utils/content-disposition.util';

import {
  MAX_DOCUMENT_BYTES,
  MAX_FILES_PER_ACCEPTANCE,
} from '@plugins/delivery/_shared/utils/delivery-file.util';
import { CreateAcceptanceDto } from '@plugins/delivery/acceptance/dto/acceptance.dto';
import {
  ACCEPTANCE_CREATE,
  ACCEPTANCE_READ,
} from '@plugins/delivery/acceptance/permissions/acceptance.permissions';
import { AcceptanceQueryService } from '@plugins/delivery/acceptance/services/acceptance-query.service';
import { AcceptanceService } from '@plugins/delivery/acceptance/services/acceptance.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('delivery/acceptance')
@ApiBearerAuth()
@Controller('delivery')
export class AcceptanceController {
  constructor(
    private readonly acceptances: AcceptanceService,
    private readonly queries: AcceptanceQueryService,
  ) {}

  @Post('orders/:orderId/acceptance')
  @RequirePermission(ACCEPTANCE_CREATE)
  @UseInterceptors(
    // The multipart parser flags a file as too large once it reaches the limit, not past it, so
    // the limit is one byte over what is allowed: exactly 20 MB passes, one byte more is a 413.
    FilesInterceptor('files', MAX_FILES_PER_ACCEPTANCE, {
      limits: { fileSize: MAX_DOCUMENT_BYTES + 1 },
    }),
  )
  @ApiOperation({
    summary: 'Upload the signed acceptance minutes of a delivered order',
    description:
      'The representative name, the Vietnam signed date and 1 to 10 files (PDF, PNG or JPEG, up to 20 MB each). Once, while the order is delivered and its installation, if any, is done; moves the order to completed.',
  })
  @ApiParam({ name: 'orderId', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        representativeName: { type: 'string' },
        signedDate: { type: 'string', example: '2026-12-20' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['representativeName', 'signedDate', 'files'],
    },
  })
  @ApiResponse({ status: 201, description: 'The acceptance minutes' })
  @ApiResponse({
    status: 400,
    description:
      'Name or date invalid, date out of bounds, file missing, type not allowed, content mismatch, or too many files',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires acceptance:create',
  })
  @ApiResponse({
    status: 404,
    description: 'No such order in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description:
      'The order is not delivered, its installation is not done, or it has minutes already',
  })
  @ApiResponse({ status: 413, description: 'File larger than 20 MB' })
  create(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CreateAcceptanceDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.acceptances.create(orderId, dto, files, user);
  }

  @Get('orders/:orderId/acceptance')
  @RequirePermission(ACCEPTANCE_READ)
  @ApiOperation({
    summary: 'The acceptance minutes of an order',
    description: 'Answers 200 with null while the order has none.',
  })
  @ApiParam({ name: 'orderId', type: Number })
  @ApiResponse({ status: 200, description: 'The minutes, or null' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires acceptance:read',
  })
  @ApiResponse({
    status: 404,
    description: 'No such order in the caller’s scope',
  })
  // Nest sends an empty body for a null return; the string keeps the JSON `null` on the wire.
  @Header('Content-Type', 'application/json')
  async findOne(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return (await this.queries.get(orderId, user)) ?? 'null';
  }

  @Get('acceptance-files/:fileId/content')
  @RequirePermission(ACCEPTANCE_READ)
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download a file of the acceptance minutes',
    description:
      'Served as an attachment, never inline. Requires access to the order.',
  })
  @ApiParam({ name: 'fileId', type: Number })
  @ApiResponse({ status: 200, description: 'File content' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires acceptance:read',
  })
  @ApiResponse({
    status: 404,
    description: 'File not found, or outside the caller’s scope',
  })
  async content(
    @Param('fileId', ParseIntPipe) fileId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const file = await this.queries.content(fileId, user);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: buildAttachmentContentDisposition(file.fileName),
      length: file.sizeBytes,
    });
  }
}
