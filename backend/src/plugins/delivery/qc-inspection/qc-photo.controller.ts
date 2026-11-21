import {
  Controller,
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

import { MAX_PHOTO_BYTES } from '@plugins/delivery/_shared/utils/delivery-file.util';
import {
  QC_INSPECTION_CREATE,
  QC_INSPECTION_READ,
} from '@plugins/delivery/qc-inspection/permissions/qc-inspection.permissions';
import { QcPhotoService } from '@plugins/delivery/qc-inspection/services/qc-photo.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('delivery/qc-inspection')
@ApiBearerAuth()
@Controller('delivery/qc')
export class QcPhotoController {
  constructor(private readonly service: QcPhotoService) {}

  @Post('round-items/:id/photos')
  @RequirePermission(QC_INSPECTION_CREATE)
  @UseInterceptors(
    // The multipart parser flags a file as too large once it reaches the limit, not past it, so
    // the limit is one byte over what is allowed: exactly 10 MB passes, one byte more is a 413.
    FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES + 1 } }),
  )
  @ApiOperation({
    summary: 'Attach a photo to a QC round item',
    description:
      'PNG or JPEG, by extension and by content, up to 10 MB each and 30 per QC round.',
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
  @ApiResponse({ status: 201, description: 'Photo attached' })
  @ApiResponse({
    status: 400,
    description:
      'File missing, type not allowed, content mismatch, or limit reached',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_inspection:create',
  })
  @ApiResponse({
    status: 404,
    description: 'No such round item in the caller’s scope',
  })
  @ApiResponse({ status: 413, description: 'File larger than 10 MB' })
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.upload(id, file, user);
  }

  @Get('photos/:photoId/content')
  @RequirePermission(QC_INSPECTION_READ)
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'The image of a QC photo',
    description:
      'Served inline with the content type stored at upload. Requires access to the cabinet.',
  })
  @ApiParam({ name: 'photoId', type: Number })
  @ApiResponse({ status: 200, description: 'Image bytes' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_inspection:read',
  })
  @ApiResponse({
    status: 404,
    description: 'Photo not found, or outside the caller’s scope',
  })
  async content(
    @Param('photoId', ParseIntPipe) photoId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const photo = await this.service.content(photoId, user);
    return new StreamableFile(photo.stream, {
      type: photo.contentType,
      length: photo.sizeBytes,
    });
  }
}
