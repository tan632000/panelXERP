/**
 * Whether a form actually owns the field an API rejection names.
 *
 * A rejection is only "shown" once it lands on a rendered field. React Hook Form accepts
 * `setError` for any name, so a field the server names but the form does not have — a DTO
 * property with no input, a line path the screen models differently — would store an error
 * nobody can read. Checking the path first lets the caller fall back to a toast instead.
 */
export function hasFormFieldPath(values: unknown, path: string): boolean {
  const segments = path.split(".").filter((segment) => segment.length > 0);
  if (segments.length === 0) return false;

  let current: unknown = values;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null) return false;
    if (!(segment in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[segment];
  }

  return true;
}
