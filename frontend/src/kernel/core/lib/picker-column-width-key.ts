/**
 * Width-preference key of a picker dialog, derived from the columns it shows.
 *
 * Pickers are too many, and too often reused across screens, to register one key each: a
 * picker is identified by its column set instead, so the same picker opened from any screen
 * keeps the widths the reader dragged, and a picker whose columns change starts over at the
 * declared widths rather than at widths measured for other columns. The backend accepts any
 * key of this shape (`picker_` + base-36 hash).
 */
export function pickerColumnWidthKey(columnKeys: readonly string[]): string {
  // FNV-1a, 32-bit: stable across sessions and builds, which a stored key needs.
  let hash = 0x811c9dc5;
  for (const char of columnKeys.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `picker_${hash.toString(36)}`;
}
