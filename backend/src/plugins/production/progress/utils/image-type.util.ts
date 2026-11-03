/**
 * The photos a cabinet may carry. A file is accepted only when its extension is png, jpg or
 * jpeg AND its leading bytes are that format's: the extension is the client's word, the bytes
 * are the file's. The stored extension and content type come from here, never from the client.
 */
export interface ImageType {
  /** Extension of the stored object key. */
  extension: 'png' | 'jpg';
  contentType: 'image/png' | 'image/jpeg';
  signature: readonly number[];
}

const PNG: ImageType = {
  extension: 'png',
  contentType: 'image/png',
  signature: [0x89, 0x50, 0x4e, 0x47],
};
const JPEG: ImageType = {
  extension: 'jpg',
  contentType: 'image/jpeg',
  signature: [0xff, 0xd8, 0xff],
};

const BY_EXTENSION: Readonly<Record<string, ImageType>> = {
  png: PNG,
  jpg: JPEG,
  jpeg: JPEG,
};

export const IMAGE_EXTENSIONS = Object.keys(BY_EXTENSION);

/** The lower-cased extension of a file name, or `null` when it has none. */
export function extensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

/** The type the name claims, or `null` when it is not an allowed image extension. */
export function imageTypeOfName(fileName: string): ImageType | null {
  const extension = extensionOf(fileName);
  return extension && Object.hasOwn(BY_EXTENSION, extension)
    ? BY_EXTENSION[extension]
    : null;
}

/** Whether the bytes begin with the signature of the type. */
export function hasImageSignature(type: ImageType, bytes: Buffer): boolean {
  return (
    bytes.length >= type.signature.length &&
    type.signature.every((byte, index) => bytes[index] === byte)
  );
}
