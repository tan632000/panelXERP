/**
 * The two string helpers every printed HTML builder in the app repeated verbatim: escaping
 * untrusted text before it lands inside `innerHTML`/`document.write`, and the mock's dash
 * placeholder for a blank value.
 */

/** Escapes the 4 characters that break out of an HTML text node or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A trimmed, escaped value, or `dash` (the mock's "—") when it is blank. */
export function textOrDash(
  value: string | null | undefined,
  dash = "—",
): string {
  const trimmed = value?.trim();
  return trimmed ? escapeHtml(trimmed) : dash;
}
