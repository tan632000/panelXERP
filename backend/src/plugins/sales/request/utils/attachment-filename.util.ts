const MAX_FILE_NAME_LENGTH = 150;

/**
 * multipart parsers read the `filename` parameter as latin1, so a UTF-8 name with
 * accented letters arrives as mojibake. When the bytes read back as valid UTF-8 the name is
 * restored; a name that was genuinely latin1 does not decode cleanly and is kept as it is.
 */
function restoreUtf8(name: string): string {
  const codes = [...name].map((char) => char.charCodeAt(0));
  const hasNonAscii = codes.some((code) => code > 0x7f);
  const isLatin1 = codes.every((code) => code <= 0xff);
  if (!hasNonAscii || !isLatin1) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/**
 * The name a stored file is shown and downloaded under. It is only ever a label: the object
 * key is generated, so nothing here reaches a path. Path parts, control characters and
 * characters that break a header or a shell are dropped; length is capped while keeping the
 * extension.
 */
export function sanitizeAttachmentName(originalName: string): string {
  const base = restoreUtf8(originalName).split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}._() -]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!cleaned) return 'file';
  if (cleaned.length <= MAX_FILE_NAME_LENGTH) return cleaned;

  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, MAX_FILE_NAME_LENGTH - extension.length) + extension;
}
