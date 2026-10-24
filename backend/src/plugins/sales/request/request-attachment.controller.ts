import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

import { MAX_ATTACHMENT_BYTES } from '@plugins/sales/request/constants/request.constant';
import {
  REQUEST_READ,
  REQUEST_UPDATE,
} from '@plugins/sales/request/permissions/request.permissions';
import { RequestAttachmentService } from '@plugins/sales/request/services/request-attachment.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('sales/requests')
@ApiBearerAuth()
@Controller('sales/requests/:id/attachments')
export class RequestAttachmentController {
  constructor(private readonly service: RequestAttachmentService) {}

  @Get()
  @RequirePermission(REQUEST_READ)
  @ApiOperation({ summary: 'List the files of a quote request' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Attachments, oldest first' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.list(id, user);
  }

  @Post()
  @RequirePermission(REQUEST_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }),
  )
  @ApiOperation({
    summary: 'Attach a file to a quote request',
    description:
      'Allowed: pdf, dwg, dxf, xlsx, png, jpg/jpeg — by extension and by content — up to 20 MB each, 20 per request, while the request is a draft, assigned or being estimated.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'File attached' })
  @ApiResponse({
    status: 400,
    description:
      'File missing, type not allowed, content mismatch, or limit reached',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:update',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 409, description: 'Request no longer accepts files' })
  @ApiResponse({ status: 413, description: 'File larger than 20 MB' })
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.upload(id, file, user);
  }

  @Get(':attachmentId')
  @RequirePermission(REQUEST_READ)
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download a file of a quote request',
    description:
      'Served as an attachment, never inline. Requires access to the request.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'attachmentId', type: Number })
  @ApiResponse({ status: 200, description: 'File content' })
  @ApiResponse({
    status: 404,
    description:
      'Request or file not found, or outside the caller’s data scope',
  })
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const file = await this.service.download(id, attachmentId, user);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: buildAttachmentContentDisposition(file.fileName),
      length: file.sizeBytes,
    });
  }

  @Delete(':attachmentId')
  @RequirePermission(REQUEST_UPDATE)
  @ApiOperation({
    summary: 'Remove a file of a quote request',
    description:
      'Only while the request is a draft, assigned or being estimated.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'attachmentId', type: Number })
  @ApiResponse({ status: 200, description: 'File removed' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:update',
  })
  @ApiResponse({ status: 404, description: 'Request or file not found' })
  @ApiResponse({
    status: 409,
    description: 'Request no longer accepts changes',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, attachmentId, user);
  }
}
