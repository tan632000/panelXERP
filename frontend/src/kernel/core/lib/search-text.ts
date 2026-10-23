/**
 * Lower-cases and strips Vietnamese diacritics, so a query typed without tone marks, or with the
 * tone mark on the other vowel (new-style vs old-style placement), still finds the accented
 * label. Every character maps to exactly one, keeping indexes aligned with the label.
 */
export function foldSearchText(text: string): string {
  return Array.from(text)
    .map((char) =>
      char
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .charAt(0),
    )
    .join("")
    .toLowerCase();
}

/** Accent- and case-insensitive "contains"; an empty query matches everything. */
export function includesFolded(
  text: string | null | undefined,
  query: string,
): boolean {
  return foldSearchText(text ?? "").includes(foldSearchText(query));
}
