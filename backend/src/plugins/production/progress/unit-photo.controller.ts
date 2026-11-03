import {
  Body,
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

import { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';
import { MAX_PHOTO_BYTES } from '@plugins/production/progress/constants/photo.constant';
import { UploadPhotoDto } from '@plugins/production/progress/dto/progress.dto';
import {
  PRODUCTION_PROGRESS_READ,
  PRODUCTION_PROGRESS_UPDATE,
} from '@plugins/production/progress/permissions/progress.permissions';
import { UnitPhotoService } from '@plugins/production/progress/services/unit-photo.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('production/progress')
@ApiBearerAuth()
@Controller('production')
export class UnitPhotoController {
  constructor(private readonly service: UnitPhotoService) {}

  @Get('units/:id/photos')
  @RequirePermission(PRODUCTION_PROGRESS_READ)
  @ApiOperation({ summary: 'List the photos of a cabinet, oldest first' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Photos of every stage' })
  @ApiResponse({
    status: 404,
    description: 'Cabinet not found, or outside the caller data scope',
  })
  list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.list(id, user);
  }

  @Post('units/:id/photos')
  @RequirePermission(PRODUCTION_PROGRESS_UPDATE)
  @UseInterceptors(
    // The multipart parser flags a file as too large once it reaches the limit, not past it, so
    // the limit is one byte over what is allowed: exactly 10 MB passes, one byte more is a 413.
    FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES + 1 } }),
  )
  @ApiOperation({
    summary: 'Attach a photo to a stage of a cabinet',
    description:
      'PNG or JPEG, by extension and by content, up to 10 MB each and 30 per cabinet, while the production order is released. Only the assigned technician or a production manager. An optional issue must belong to the same cabinet.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        stage: { type: 'string', enum: Object.values(ProductionStage) },
        issueId: { type: 'integer' },
      },
      required: ['file', 'stage'],
    },
  })
  @ApiResponse({ status: 201, description: 'Photo attached' })
  @ApiResponse({
    status: 400,
    description:
      'File missing, type not allowed, content mismatch, foreign issue, or limit reached',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_progress:update',
  })
  @ApiResponse({ status: 404, description: 'Cabinet not found or not yours' })
  @ApiResponse({ status: 409, description: 'Order not released' })
  @ApiResponse({ status: 413, description: 'File larger than 10 MB' })
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadPhotoDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.upload(id, file, dto, user);
  }

  @Get('photos/:photoId/content')
  @RequirePermission(PRODUCTION_PROGRESS_READ)
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'The image of a photo',
    description:
      'Served with the content type stored at upload. Requires access to the cabinet.',
  })
  @ApiParam({ name: 'photoId', type: Number })
  @ApiResponse({ status: 200, description: 'Image bytes' })
  @ApiResponse({
    status: 404,
    description: 'Photo not found, or outside the caller data scope',
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
