export interface SupplierLabelInput {
  code?: string | null;
  shortName?: string | null;
  name?: string | null;
}

/** Mock `{ma_ncc} — {viet_tat || ten}`; code only when no name; "—" when neither. */
export function supplierInlineLabel({
  code,
  shortName,
  name,
}: SupplierLabelInput): string {
  const display = shortName || name || "";
  if (code && display) return `${code} — ${display}`;
  return code || display || "—";
}
