import { Injectable, NotFoundException } from '@nestjs/common';

import { S3StorageService } from '@shared/services/s3-storage.service';
import { buildAttachmentContentDisposition } from '@shared/utils/content-disposition.util';

@Injectable()
export class FilesService {
  constructor(private readonly s3: S3StorageService) {}

  async upload(file: Express.Multer.File, folder?: string) {
    const result = await this.s3.uploadFile(file, folder ?? 'documents');
    // Encode S3 key so any instance can resolve the file without in-memory state.
    const id = Buffer.from(result.key, 'utf8').toString('base64url');
    return {
      id,
      key: result.key,
      bucket: result.bucket,
      originalName: result.originalName,
    };
  }

  /**
   * Resolves a short-lived URL for a stored object.
   *
   * `disposition: 'attachment'` makes the browser save the file rather than display it, under
   * the caller's file name: the object key carries a generated name, so without this a download
   * lands as an opaque string.
   */
  async getSignedUrl(
    id: string,
    options?: { disposition?: 'inline' | 'attachment'; fileName?: string },
  ) {
    let key: string;
    try {
      key = Buffer.from(id, 'base64url').toString('utf8');
    } catch {
      throw new NotFoundException(`File ${id} not found`);
    }
    if (
      !key ||
      key.includes('\0') ||
      key.startsWith('/') ||
      key.includes('..')
    ) {
      throw new NotFoundException(`File ${id} not found`);
    }
    const url = await this.s3.getSignedUrl(
      key,
      3600,
      options?.disposition === 'attachment'
        ? {
            responseContentDisposition: buildAttachmentContentDisposition(
              options.fileName?.trim() || key.split('/').pop() || 'download',
            ),
          }
        : undefined,
    );
    return { id, url };
  }
}
