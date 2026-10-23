export function parsePositiveIntId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    const parsed = Number(raw);
    return parsed > 0 ? parsed : null;
  }
  return null;
}
