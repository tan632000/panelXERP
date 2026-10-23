import { BRAND_LOGO_SRC } from "@/kernel/core/lib/print/brand-logo";
import { escapeHtml } from "@/kernel/core/lib/print/html";

export type HpLetterheadVariant = "logoLeft" | "logoRight";

export interface HpLetterheadLabels {
  companyName: string;
  companyAddress: string;
  /**
   * Extra address-block lines under the address, already composed by the caller: the mock's
   * single combined "Tel … MST …" line (`logoLeft`), or the quotation's separate tax-code and
   * phone lines (`logoRight`).
   */
  contactLines: string[];
}

export interface HpLetterheadOptions {
  /** `"logoLeft"` (default) is the canonical mock header (`_hpPrintHeaderHTML`); `"logoRight"`
   * is the quotation's text-left/logo-right header. */
  variant?: HpLetterheadVariant;
  /** Logo width in px — the canonical header uses 64, the quotation variant 70. */
  logoWidthPx?: number;
  /** A rule under the header, like `_hpPrintHeaderHTML`'s `border-bottom`. Defaults to `true`
   * for `"logoLeft"`, `false` for `"logoRight"` (the quotation header has none). */
  divider?: boolean;
}

/**
 * The company letterhead every printed document opens with (mock `_hpPrintHeaderHTML`): logo
 * + company block, inline-styled so it renders the same regardless of the page's own `<style>`.
 */
export function buildHpLetterhead(
  labels: HpLetterheadLabels,
  options: HpLetterheadOptions = {},
): string {
  const {
    variant = "logoLeft",
    logoWidthPx = variant === "logoRight" ? 70 : 64,
    divider = variant === "logoLeft",
  } = options;

  const lineFontSize = variant === "logoRight" ? 11 : 10;
  const lineColor = variant === "logoRight" ? "#333" : "#444";
  // `pre-wrap` keeps the mock's `Tel …&nbsp;&nbsp;MST …` double space, which a plain i18n string
  // would otherwise collapse to one.
  const lineStyle = `font-size:${lineFontSize}px;color:${lineColor};margin-top:3px;line-height:1.5;white-space:pre-wrap`;

  const logo = `<img src="${BRAND_LOGO_SRC}" alt="" style="width:${logoWidthPx}px;height:auto;flex-shrink:0">`;
  const text = `<div>
    <b style="display:block;font-size:13px;margin-bottom:2px">${escapeHtml(labels.companyName)}</b>
    <div style="${lineStyle}">${escapeHtml(labels.companyAddress)}</div>
    ${labels.contactLines.map((line) => `<div style="${lineStyle}">${escapeHtml(line)}</div>`).join("")}
  </div>`;

  const justify =
    variant === "logoRight" ? "justify-content:space-between;" : "";
  const borderStyle = divider
    ? "border-bottom:2px solid #333;padding-bottom:10px;"
    : "";
  const children =
    variant === "logoRight" ? `${text}${logo}` : `${logo}${text}`;

  return `<div style="display:flex;gap:14px;align-items:center;${justify}${borderStyle}margin-bottom:14px;text-align:left">${children}</div>`;
}
