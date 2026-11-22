import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
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
  MAX_FILES_PER_RECEIPT,
} from '@plugins/delivery/_shared/utils/delivery-file.util';
import { ReceiveDeliveryNoteDto } from '@plugins/delivery/delivery-note/dto/delivery-note.dto';
import {
  DELIVERY_NOTE_READ,
  DELIVERY_NOTE_RECEIVE,
} from '@plugins/delivery/delivery-note/permissions/delivery-note.permissions';
import { DeliveryNoteFileService } from '@plugins/delivery/delivery-note/services/delivery-note-file.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('delivery/delivery-note')
@ApiBearerAuth()
@Controller('delivery/notes/:id')
export class DeliveryNoteFileController {
  constructor(private readonly service: DeliveryNoteFileService) {}

  @Post('receive')
  @HttpCode(200)
  @RequirePermission(DELIVERY_NOTE_RECEIVE)
  @UseInterceptors(
    // The multipart parser flags a file as too large once it reaches the limit, not past it, so
    // the limit is one byte over what is allowed: exactly 20 MB passes, one byte more is a 413.
    FilesInterceptor('files', MAX_FILES_PER_RECEIPT, {
      limits: { fileSize: MAX_DOCUMENT_BYTES + 1 },
    }),
  )
  @ApiOperation({
    summary: 'Record the customer receipt of a shipped delivery note',
    description:
      'The receiver name, the Vietnam date of receipt and 1 to 5 handover files (PDF, PNG or JPEG, up to 20 MB each). The receipt that leaves no cabinet of the order un-received moves the order to delivered.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        receiverName: { type: 'string' },
        receivedDate: { type: 'string', example: '2026-12-02' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['receiverName', 'receivedDate', 'files'],
    },
  })
  @ApiResponse({ status: 200, description: 'The received delivery note' })
  @ApiResponse({
    status: 400,
    description:
      'Name or date invalid, date out of bounds, file missing, type not allowed, content mismatch, or too many files',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:receive',
  })
  @ApiResponse({
    status: 404,
    description: 'No such delivery note in the caller’s scope',
  })
  @ApiResponse({ status: 409, description: 'The note is not shipped' })
  @ApiResponse({ status: 413, description: 'File larger than 20 MB' })
  receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReceiveDeliveryNoteDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.receive(id, dto, files, user);
  }

  @Get('files/:fileId/content')
  @RequirePermission(DELIVERY_NOTE_READ)
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download a handover file of a delivery note',
    description:
      'Served as an attachment, never inline. Requires access to the note’s order.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'fileId', type: Number })
  @ApiResponse({ status: 200, description: 'File content' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires delivery_note:read',
  })
  @ApiResponse({
    status: 404,
    description: 'Note or file not found, or outside the caller’s scope',
  })
  async content(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const file = await this.service.content(id, fileId, user);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: buildAttachmentContentDisposition(file.fileName),
      length: file.sizeBytes,
    });
  }
}
