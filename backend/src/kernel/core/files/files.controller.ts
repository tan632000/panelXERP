import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermission } from '@kernel/core/auth/decorators/auth.decorators';
import { FileUrlQueryDto } from '@kernel/core/files/dto/file-url-query.dto';
import { FilesService } from '@kernel/core/files/files.service';
import {
  FILE_READ,
  FILE_WRITE,
} from '@kernel/core/files/permissions/file.permissions';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @ApiOperation({ summary: 'Upload one file and store it' })
  @Post('upload')
  @RequirePermission(FILE_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.filesService.upload(file);
  }

  @ApiOperation({
    summary: 'Issue a short-lived signed URL for one stored file',
  })
  @Get(':id')
  @RequirePermission(FILE_READ)
  getUrl(@Param('id') id: string, @Query() query: FileUrlQueryDto) {
    return this.filesService.getSignedUrl(id, query);
  }
}
