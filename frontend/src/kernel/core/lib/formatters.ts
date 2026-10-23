import { toIntlLocale } from "@/kernel/i18n/locale";

export function formatDate(
  value?: string | null,
  locale?: string | null,
): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(toIntlLocale(locale));
}

/**
 * `YYYY-MM-DD` (or an ISO datetime) → `DD/MM/YYYY` by string split, never through
 * `Date`: `new Date('2026-09-18')` is UTC midnight, so `toLocaleDateString` can render
 * a shifted day west of UTC, and it drops zero-padding (`18/9/2026`). Matches the
 * NVL receipt tables, which always read `18/09/2026`.
 */
export function formatIsoDate(value?: string | null): string {
  const raw = String(value ?? "");
  const [y, m, d] = raw.split("-");
  const day = (d ?? "").slice(0, 2);
  if (
    !/^\d{4}$/.test(y ?? "") ||
    !/^\d{1,2}$/.test(m ?? "") ||
    !/^\d{1,2}$/.test(day)
  ) {
    return raw;
  }
  return `${day.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

/**
 * An ISO timestamp → `DD/MM/YYYY HH:mm` in the viewer's own timezone.
 *
 * Unlike `formatIsoDate` this one must go through `Date`: the value is an instant rather than
 * a calendar day, and the clock part only means anything once it has been moved into the
 * local zone. Use it wherever the order of two events on the same day matters — an approval
 * stamp, a last-updated line — which a date alone cannot distinguish.
 */
export function formatIsoDateTime(value?: string | null): string {
  const raw = String(value ?? "");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (part: number) => String(part).padStart(2, "0");
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Every number in this system reads with a dot for thousands and a comma for decimals
 * (`1.234.567,89`) — a business rule from the customer, not a translation, so it does NOT
 * follow the UI language: an English screen shows the same separators a Vietnamese one does.
 * Dates stay locale-aware; only the digits are pinned.
 */
const NUMBER_LOCALE = "vi-VN";

export function formatCurrency(
  value?: number | null,
  currency = "VND",
): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(
  value?: number | null,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(NUMBER_LOCALE, options).format(value);
}

/**
 * A VAT rate as every screen, print sheet and export shows it — the mock's `_vatTxt`: a rate
 * nobody entered reads as a dash, any entered rate (zero included) as `8%` / `0%`.
 */
export function formatVatPct(
  value: string | number | null | undefined,
  empty = "-",
): string {
  if (value === null || value === undefined || value === "") return empty;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? `${formatNumber(numeric)}%` : empty;
}

/**
 * A stored quantity (`numeric` columns read back as text like `"950.000"`)
 * → the same vi-VN grouped display the pickers and pending tables use
 * (`950`, `1.234,5`). Whole numbers hide their decimals — `950.000` reads
 * `950` — exactly like the mock's `(v||0).toLocaleString('vi-VN')`. Blank and
 * non-numeric input fall back to `empty`.
 */
export function formatStoredQuantity(
  value: string | number | null | undefined,
  empty: string,
): string {
  if (value === null || value === undefined || value === "") return empty;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isNaN(numeric) ? empty : formatNumber(numeric);
}

/**
 * An amount followed by the currency it is expressed in: `6.400.000 VND`.
 *
 * Documents that close with a money panel and documents that list money per line have to
 * agree on this, or one receipt reads two ways on one screen. Kept beside `formatNumber` so
 * the grouping rule stays single-sourced; `formatCurrency` above is the `Intl` symbol form
 * (`6.400.000 ₫`), which is a different choice for a different surface.
 */
export function formatAmountWithCurrency(
  value?: number | null,
  currency = "VND",
): string {
  return `${formatNumber(value)} ${currency}`;
}

export function formatToday(
  locale?: string | null,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  },
): string {
  return new Date().toLocaleDateString(toIntlLocale(locale), options);
}

const INPUT_GROUP_SEPARATOR = ".";
const INPUT_DECIMAL_SEPARATOR = ",";

export interface NumberInputParts {
  /** What the user sees: `1.234.567,89`. */
  display: string;
  /** What the caller stores: a plain JS number literal string, `1234567.89`. */
  canonical: string;
  /** The same value as a number, or `null` when the field holds no digits. */
  numeric: number | null;
}

export interface NumberInputParseOptions {
  /** `false` keeps the field integer-only — a typed comma is dropped. */
  allowDecimal?: boolean;
  /** Hard cap on decimal digits; extra keystrokes are ignored. */
  decimalScale?: number;
  allowNegative?: boolean;
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, INPUT_GROUP_SEPARATOR);
}

/**
 * Reads whatever sits in a number field mid-typing and splits it into the display form and the
 * stored form. Grouping dots are the mask's own output, so a typed dot is dropped and only the
 * comma opens the decimal part — the separators the customer specified, pinned regardless of
 * UI language, exactly like `formatNumber`.
 */
export function parseNumberInputValue(
  raw: string,
  {
    allowDecimal = true,
    decimalScale,
    allowNegative = true,
  }: NumberInputParseOptions = {},
): NumberInputParts {
  const text = String(raw ?? "");
  const sign = allowNegative && text.trimStart().startsWith("-") ? "-" : "";
  const body = text.replace(/-/g, "");
  const decimalIndex = allowDecimal
    ? body.indexOf(INPUT_DECIMAL_SEPARATOR)
    : -1;
  const intDigits = (decimalIndex === -1 ? body : body.slice(0, decimalIndex))
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
  let decDigits =
    decimalIndex === -1 ? "" : body.slice(decimalIndex + 1).replace(/\D/g, "");
  if (decimalScale != null) decDigits = decDigits.slice(0, decimalScale);
  const hasDecimal = decimalIndex !== -1 && decimalScale !== 0;

  if (!intDigits && !hasDecimal) {
    return { display: sign, canonical: "", numeric: null };
  }

  const display =
    sign +
    groupDigits(intDigits || (hasDecimal ? "0" : "")) +
    (hasDecimal ? INPUT_DECIMAL_SEPARATOR + decDigits : "");
  const canonical =
    sign + (intDigits || "0") + (decDigits ? `.${decDigits}` : "");

  return { display, canonical, numeric: Number(canonical) };
}

/**
 * Spells a number out in full digits.
 *
 * `String(0.0000001)` is `"1e-7"`, which a digit-by-digit reader turns into `17`. Formatting
 * with an explicit locale keeps the exponent out of the text at any magnitude a price or a
 * quantity can reach.
 */
function toPlainDigits(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
}

/**
 * A stored value carries at most one dot, and it is the decimal point (`1234567.89`). Text
 * holding several is a display string that has come back round — `1.234.567` — where every dot
 * is grouping instead. Reading the first one as a decimal point there would turn 1.234.567 into
 * 1,234 and then feed that back as the field's value, so the two cases are told apart by how
 * many dots there are rather than assumed.
 */
function storedTextToInput(text: string): string {
  const dots = text.match(/\./g)?.length ?? 0;
  if (dots > 1) return text.replace(/\./g, "");
  return text.replace(".", INPUT_DECIMAL_SEPARATOR);
}

/** Turns a stored value (`1234567.89`, or the number itself) into the same parts. */
export function formatNumberForInput(
  value: string | number | null | undefined,
  options?: NumberInputParseOptions,
): NumberInputParts {
  if (value == null || value === "") {
    return { display: "", canonical: "", numeric: null };
  }
  const text = typeof value === "number" ? toPlainDigits(value) : String(value);
  return parseNumberInputValue(storedTextToInput(text), options);
}
