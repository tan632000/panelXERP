/** Reference labels across master data read `code — name`. */
const RECORD_LABEL_SEPARATOR = " — ";

/**
 * The `code — name` label a reference field shows for its selection.
 *
 * Returns the code alone while the name is still unresolved, so a field never renders a
 * dangling separator.
 */
export function recordLabel(code: string, name?: string | null): string {
  if (!code) return "";
  const trimmedName = name?.trim();
  return trimmedName ? `${code}${RECORD_LABEL_SEPARATOR}${trimmedName}` : code;
}

/**
 * The search term hidden inside a reference label.
 *
 * A picker input holds the label of its selection (code plus resolved name), and a user
 * may type the full label. Sending that whole string to the backend matches nothing, so only
 * the code half in front of the separator is searched.
 */
export function recordLabelToQuery(text: string): string {
  const [code] = text.split(RECORD_LABEL_SEPARATOR);
  return (code ?? text).trim();
}

/**
 * The name half of a reference label.
 *
 * A form holds the whole `code — name` label for its picker, while a companion read-only field
 * shows the name on its own. An unresolved label carries no name, so this yields an empty string
 * rather than repeating the code.
 */
export function recordLabelToName(text: string): string {
  const separatorAt = text.indexOf(RECORD_LABEL_SEPARATOR);
  if (separatorAt < 0) return "";
  return text.slice(separatorAt + RECORD_LABEL_SEPARATOR.length).trim();
}
