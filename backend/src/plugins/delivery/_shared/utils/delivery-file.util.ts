import { randomUUID } from 'crypto';

import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

import {
  hasImageSignature,
  IMAGE_EXTENSIONS,
  imageTypeOfName,
  extensionOf,
} from '@plugins/production/progress/utils/image-type.util';
import { sanitizePhotoName } from '@plugins/production/progress/utils/photo-filename.util';
import { ATTACHMENT_TYPES } from '@plugins/sales/request/utils/attachment-type.util';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const MAX_PHOTOS_PER_QC_ROUND = 30;
export const MAX_PHOTOS_PER_INSTALLATION = 30;
export const MAX_FILES_PER_RECEIPT = 5;
export const MAX_FILES_PER_ACCEPTANCE = 10;

/** The part of a multer file the checks read. */
export type UploadedDeliveryFile = Pick<
  Express.Multer.File,
  'originalname' | 'buffer'
>;

/** A file that passed its checks, as it will be stored. */
export interface CheckedDeliveryFile {
  buffer: Buffer;
  /** Display label only: sanitised, never part of the object key. */
  fileName: string;
  /** Extension of the object key: png, jpg or pdf. */
  extension: string;
  /** From the file's type, never from what the client declared. */
  contentType: string;
}

const DOCUMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'] as const;

function receive(
  file: UploadedDeliveryFile | undefined,
  maxBytes: number,
): { buffer: Buffer; fileName: string } {
  if (!file?.buffer) throw new BadRequestException('File is required.');
  if (file.buffer.length > maxBytes) {
    throw new PayloadTooLargeException(
      `A file may be at most ${maxBytes / (1024 * 1024)} MB.`,
    );
  }
  return {
    buffer: file.buffer,
    fileName: sanitizePhotoName(file.originalname),
  };
}

/** A photo: PNG or JPEG by extension and by content, up to 10 MB. */
export function checkPhoto(
  file: UploadedDeliveryFile | undefined,
): CheckedDeliveryFile {
  const { buffer, fileName } = receive(file, MAX_PHOTO_BYTES);
  const type = imageTypeOfName(fileName);
  if (!type) {
    throw new BadRequestException(
      `File type is not allowed. Allowed types: ${IMAGE_EXTENSIONS.join(', ')}.`,
    );
  }
  if (!hasImageSignature(type, buffer)) {
    throw new BadRequestException(
      `File content is not a valid ${type.contentType} image.`,
    );
  }
  return {
    buffer,
    fileName,
    extension: type.extension,
    contentType: type.contentType,
  };
}

/** A document: PDF, PNG or JPEG by extension and by content, up to 20 MB. */
export async function checkDocument(
  file: UploadedDeliveryFile | undefined,
): Promise<CheckedDeliveryFile> {
  const { buffer, fileName } = receive(file, MAX_DOCUMENT_BYTES);
  const extension = extensionOf(fileName);
  const type =
    extension !== null &&
    (DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)
      ? ATTACHMENT_TYPES[extension]
      : undefined;
  if (!extension || !type) {
    throw new BadRequestException(
      `File type is not allowed. Allowed types: ${DOCUMENT_EXTENSIONS.join(', ')}.`,
    );
  }
  if (!(await type.matches(buffer))) {
    throw new BadRequestException(
      `File content is not a valid ${type.contentType} file.`,
    );
  }
  return {
    buffer,
    fileName,
    extension: extension === 'jpeg' ? 'jpg' : extension,
    contentType: type.contentType,
  };
}

/** `delivery/<kind>/<ownerId>/<uuid>.<ext>`: random, so the uploaded name never reaches a path. */
export function objectKey(
  kind: string,
  ownerId: number,
  extension: string,
): string {
  return `delivery/${kind}/${ownerId}/${randomUUID()}.${extension}`;
}
