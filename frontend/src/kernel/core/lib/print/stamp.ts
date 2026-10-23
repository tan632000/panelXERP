import { STAMP_FONT_FAMILY } from "@/kernel/core/lib/print/fonts";

/**
 * Shared layout for the 70x80mm "Tem TP" stamp family (mock `_temTPCanvas` /
 * `_temTPPrintStamps`): logo + company letterhead header, a label-code row plus wrapped info
 * rows, and a bottom quantity/weight/week block with a QR to its right. Used by the warehouse
 * finished-product box label (`plugins/warehouse/finished-product/utils/box-label.ts`, many
 * stamps per print run) and the packaging product label
 * (`plugins/production/packaging/utils/product-label.ts`, exactly one stamp per order) — the
 * calibration tag's much simpler borderless label (no QR/logo) keeps its own drawing code.
 */

/** Physical size of one Tem TP stamp, borderless. */
export const STAMP_SIZE_MM = { width: 70, height: 80 } as const;

/**
 * A long product name prints in full (no clipping): the text wraps and, when the stamp would
 * overflow, every size shrinks by `STAMP_SCALE_STEP` down to `STAMP_MIN_SCALE` of the original
 * (mock `_temTPPrintStamps` / `_temTPCanvas`). The canvas wraps a value up to
 * `STAMP_INFO_MAX_LINES` lines.
 */
export const STAMP_MIN_SCALE = 0.65;
export const STAMP_SCALE_STEP = 0.03;
export const STAMP_INFO_MAX_LINES = 8;

export interface StampInfoRow {
  label: string;
  value: string;
  /** `"nowrap"` shrinks the value to fit one line (the label-code row); `"wrap"` shows it all. */
  mode: "wrap" | "nowrap";
}

/** A bottom-block row; an empty `label` prints the value alone (the mock's week line). */
export interface StampBottomRow {
  label: string;
  value: string;
  big?: boolean;
}

export interface StampLetterheadCaptions {
  companyName: string;
  companyAddress: string;
  madeIn: string;
}

/** The info/bottom rows and QR of one stamp, already content-mapped by the caller. */
export interface StampContent {
  letterhead: StampLetterheadCaptions;
  infoRows: StampInfoRow[];
  bottomRows: StampBottomRow[];
}

/** One stamp's screen/print markup (mock `_temTPPrintStamps`): header, info rows, bottom block. */
export function stampBodyHtml(
  content: StampContent,
  logoSrc: string,
  qrDataUrl: string,
  escapeHtml: (value: string) => string,
): string {
  const { letterhead, infoRows, bottomRows } = content;
  return `<div class="stamp">
    <div class="hdr"><img src="${logoSrc}" alt=""><div class="co"><b>${escapeHtml(letterhead.companyName)}</b><div>${escapeHtml(letterhead.companyAddress)}</div><div>${escapeHtml(letterhead.madeIn)}</div></div></div>
    <div class="info">
      ${infoRows.map((row) => `<div class="row"><span class="label">${escapeHtml(row.label)}:</span><span class="val${row.mode === "nowrap" ? " nw" : ""}">${escapeHtml(row.value)}</span></div>`).join("")}
    </div>
    <div class="bot">
      <div class="botl">
        ${bottomRows.map((row) => (row.label ? `<div class="row"><span class="label">${escapeHtml(row.label)}:</span><span class="val${row.big ? " big" : ""}">${escapeHtml(row.value)}</span></div>` : `<div class="row"><span class="val">${escapeHtml(row.value)}</span></div>`)).join("")}
      </div>
      ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}">` : ""}
    </div>
  </div>`;
}

/** The CSS shared by every stamp page — `multiPage` adds the per-stamp page-break rules. */
export function stampPageCss(multiPage: boolean): string {
  const pageBreak = multiPage
    ? "break-after:page;page-break-after:always;"
    : "break-after:auto;page-break-after:auto;";
  const lastChild = multiPage
    ? ".stamp:last-child{break-after:auto;page-break-after:auto}"
    : "";
  return `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:${STAMP_FONT_FAMILY};color:#000}
  @page{size:70mm 80mm;margin:0}
  .stamp{--k:1;width:70mm;height:80mm;padding:2.5mm 3mm;overflow:hidden;display:flex;flex-direction:column;gap:1.2mm;${pageBreak}break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  ${lastChild}
  .hdr{display:flex;align-items:center;gap:2mm;border-bottom:0.3mm solid #000;padding-bottom:1mm}
  .hdr img{width:10mm;height:auto;flex-shrink:0}
  .co{flex:1;text-align:center;line-height:1.2;font-size:calc(10.5px*var(--k))}.co b{display:block;font-size:calc(13.5px*var(--k));white-space:nowrap}
  .row{display:flex;gap:1.5mm;align-items:baseline;line-height:1.18;margin:0}
  .label{font-size:calc(11.5px*var(--k));min-width:19.5mm;flex-shrink:0}
  .val{font-size:calc(15px*var(--k));font-weight:700;word-break:break-word;overflow-wrap:anywhere}.val.nw{white-space:nowrap;font-size:calc(14px*var(--k))}
  .val.big{font-size:calc(18px*var(--k));white-space:nowrap;display:block;overflow:hidden}
  .info{display:flex;flex-direction:column;gap:0.6mm}
  .bot{display:flex;align-items:center;gap:2mm;border-top:0.3mm solid #000;padding-top:1.2mm}
  .botl{flex:1;display:flex;flex-direction:column;gap:0.6mm;min-width:0}
  .botl .label{min-width:13mm}
  .qr{width:25mm;height:25mm;flex-shrink:0;image-rendering:pixelated}
  .bar{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(15,23,42,.06);padding:12px 20px;display:flex;flex-direction:column;gap:6px}
  .bar-main{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .bar-title{flex:1;min-width:220px;display:flex;flex-direction:column;gap:2px}
  .bar-title b{font-size:15px;color:#0f172a}
  .bar-title span{font-size:12px;color:#64748b}
  .bar-actions{display:flex;gap:8px;flex-wrap:wrap}
  .bar button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;transition:background .15s,border-color .15s}
  .bar button:hover:not(:disabled){background:#f1f5f9;border-color:#94a3b8}
  .bar button:disabled{opacity:.5;cursor:not-allowed}
  .bar .pri{background:#1e3a8a;color:#fff;border-color:#1e3a8a}
  .bar .pri:hover:not(:disabled){background:#1e40af;border-color:#1e40af}
  .bar svg{width:16px;height:16px;flex-shrink:0}
  .bar-sub{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px}
  .note{flex:1;min-width:220px;color:#64748b}
  .status{display:none;align-items:center;gap:6px;font-weight:600;color:#1e3a8a}
  .status.on{display:inline-flex}
  .status.err{color:#b91c1c}
  .spin{width:14px;height:14px;border:2px solid #bfdbfe;border-top-color:#1e3a8a;border-radius:50%;animation:spin .8s linear infinite}
  .status.err .spin,.status.done .spin{display:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  .sheet{display:flex;flex-wrap:wrap;justify-content:center;align-content:flex-start;gap:16px;padding:20px}
  @media screen{body{background:#e2e8f0}.stamp{background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.18);border-radius:2px}}
  @media print{.bar{display:none}.sheet{display:block;padding:0}}`;
}

/** The print-window toolbar's captions. */
export interface StampToolbarCaptions {
  printLabel: string;
  downloadPdfLabel: string;
  downloadPngLabel: string;
  note: string;
  /** The heading beside the buttons (e.g. "PNK-TP-2026-0001-L1 — 103 tem"); none when absent. */
  heading?: string;
}

const PRINTER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2"/><path d="M17 9V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4"/><rect x="7" y="13" width="10" height="8" rx="2"/></svg>`;
const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5l5-5"/><path d="M12 4v12"/></svg>`;

/** Element ids the download runner drives while a file is being built. */
const STAMP_BUTTON_IDS = ["hp-stamp-print", "hp-stamp-pdf", "hp-stamp-png"];
const STAMP_STATUS_ID = "hp-stamp-status";

/**
 * The screen-only toolbar: a heading, print / download-PDF / download-PNG buttons, the note and
 * a status line the download runner fills while it builds a file.
 */
export function stampToolbarHtml(
  toolbar: StampToolbarCaptions,
  escapeHtml: (value: string) => string,
): string {
  return `<div class="bar">
    <div class="bar-main">
      <div class="bar-title">${toolbar.heading ? `<b>${escapeHtml(toolbar.heading)}</b>` : ""}</div>
      <div class="bar-actions">
        <button id="hp-stamp-print" class="pri" onclick="window.print()">${PRINTER_ICON}${escapeHtml(toolbar.printLabel)}</button>
        <button id="hp-stamp-pdf" onclick="opener&&opener.__hpStampDownload&&opener.__hpStampDownload('pdf')">${DOWNLOAD_ICON}${escapeHtml(toolbar.downloadPdfLabel)}</button>
        <button id="hp-stamp-png" onclick="opener&&opener.__hpStampDownload&&opener.__hpStampDownload('png')">${DOWNLOAD_ICON}${escapeHtml(toolbar.downloadPngLabel)}</button>
      </div>
    </div>
    <div class="bar-sub">
      <span class="note">${escapeHtml(toolbar.note)}</span>
      <span id="${STAMP_STATUS_ID}" class="status" role="status" aria-live="polite"><span class="spin"></span><span class="txt"></span></span>
    </div>
  </div>`;
}

/**
 * `window.open` features for a stamp print window: wide enough to lay several stamps side by
 * side, centred on the user's screen.
 */
export function stampPopupFeatures(): string {
  if (typeof window === "undefined") return "width=1100,height=800";
  const screenWidth = window.screen?.availWidth || 1280;
  const screenHeight = window.screen?.availHeight || 800;
  const width = Math.min(1200, Math.max(720, screenWidth - 120));
  const height = Math.min(1000, Math.max(600, screenHeight - 100));
  const left = Math.max(0, Math.round((screenWidth - width) / 2));
  const top = Math.max(0, Math.round((screenHeight - height) / 2));
  return `width=${width},height=${height},left=${left},top=${top}`;
}

/** Captions of the status line a download shows while it runs. */
export interface StampDownloadStatusCaptions {
  working: (done: number, total: number) => string;
  failed: string;
}

/**
 * Runs one file download for a stamp print window. The window is the focused one, so the
 * rendering yields to *its* timers (the opener tab is in the background and its timers are
 * throttled), the buttons stay disabled until the file is saved — a second click cannot queue a
 * second batch — and the status line counts the stamps rendered so far.
 */
export async function runStampDownload(
  popup: Window,
  captions: StampDownloadStatusCaptions | undefined,
  task: (
    progress: (done: number, total: number) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  const doc = popup.document;
  if (doc.body.dataset.busy === "1") return;
  doc.body.dataset.busy = "1";
  const buttons = STAMP_BUTTON_IDS.map((id) => doc.getElementById(id)).filter(
    (el): el is HTMLButtonElement => el?.tagName === "BUTTON",
  );
  const status = doc.getElementById(STAMP_STATUS_ID);
  const text = status?.querySelector(".txt");
  const setStatus = (value: string, kind: "on" | "err" | "off") => {
    if (!status || !text) return;
    text.textContent = value;
    status.className =
      kind === "off" ? "status" : `status on${kind === "err" ? " err" : ""}`;
  };
  buttons.forEach((button) => {
    button.disabled = true;
  });

  const progress = async (done: number, total: number) => {
    if (captions) setStatus(captions.working(done, total), "on");
    await new Promise<void>((resolve) => popup.setTimeout(resolve, 0));
  };

  try {
    await task(progress);
    setStatus("", "off");
  } catch {
    if (captions) setStatus(captions.failed, "err");
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
    delete doc.body.dataset.busy;
  }
}

/** The script that auto-shrinks a stamp's text (`--k`, down to 65%) and its code/quantity line to fit. */
export const STAMP_AUTOFIT_SCRIPT = `window.onload=()=>{ document.querySelectorAll('.stamp').forEach(s=>{ let k=1; while(s.scrollHeight>s.clientHeight+1&&k>${STAMP_MIN_SCALE}){ k=+(k-${STAMP_SCALE_STEP}).toFixed(2); s.style.setProperty('--k',k); } });
      document.querySelectorAll('.val.nw,.val.big').forEach(v=>{ let f=parseFloat(getComputedStyle(v).fontSize); while(v.scrollWidth>v.clientWidth+1&&f>9){ f-=0.5; v.style.fontSize=f+'px'; } });
    };`;

/** Full popup document for one print run of borderless Tem TP stamps (mock `_temTPPrintStamps`). */
export function buildStampPrintHtml(options: {
  title: string;
  stampsBody: string;
  multiPage: boolean;
  toolbar: StampToolbarCaptions;
  escapeHtml: (value: string) => string;
}): string {
  const { title, stampsBody, multiPage, toolbar, escapeHtml } = options;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>${stampPageCss(multiPage)}</style></head><body>
  ${stampToolbarHtml(toolbar, escapeHtml)}<div class="sheet">${stampsBody}</div>
  <script>
    ${STAMP_AUTOFIT_SCRIPT}
  <\/script></body></html>`;
}

/**
 * Draws one stamp onto a canvas at `dpi` (mock `_temTPCanvas`): logo + letterhead header, info
 * rows wrapped to up to 8 lines (a `"nowrap"` row shrinks to fit on 1 line instead), a bottom
 * block of quantity/weight/week rows with the QR to its right — auto-shrinking (`k` down to 0.65)
 * when the
 * content would otherwise overflow the 70x80mm page. An empty bottom-row label prints the value
 * alone, flush left (the mock's week line).
 */
export function drawStampCanvas(options: {
  infoRows: StampInfoRow[];
  bottomRows: StampBottomRow[];
  letterhead: StampLetterheadCaptions;
  logo: HTMLImageElement | null;
  qr: HTMLImageElement | null;
  dpi: number;
}): HTMLCanvasElement {
  const { infoRows, bottomRows, letterhead, logo, qr, dpi } = options;
  const mm = dpi / 25.4;
  const width = Math.round(STAMP_SIZE_MM.width * mm);
  const height = Math.round(STAMP_SIZE_MM.height * mm);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // CSS px -> canvas px at this dpi (1 CSS px = 1/96in = 0.2646mm).
  const px = (cssPx: number) => cssPx * 0.2646 * mm;
  const font = (size: number, bold?: boolean) =>
    `${bold ? "bold " : ""}${size}px ${STAMP_FONT_FAMILY}`;
  const left = 3 * mm;
  const right = width - 3 * mm;
  const top0 = 2.5 * mm;

  const wrap = (text: string, maxWidth: number, maxLines: number): string[] => {
    const words = text.split(/(\s+)/);
    const out: string[] = [];
    let current = "";
    words.forEach((word) => {
      const attempt = current + word;
      if (
        ctx.measureText(attempt.trim()).width <= maxWidth ||
        !current.trim()
      ) {
        current = attempt;
      } else {
        out.push(current.trim());
        current = word.trimStart();
      }
    });
    if (current.trim()) out.push(current.trim());

    const wrapped: string[] = [];
    out.forEach((line) => {
      let remaining = line;
      while (
        ctx.measureText(remaining).width > maxWidth &&
        remaining.length > 1
      ) {
        let cut = remaining.length;
        while (
          cut > 1 &&
          ctx.measureText(remaining.slice(0, cut)).width > maxWidth
        ) {
          cut -= 1;
        }
        wrapped.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut);
      }
      wrapped.push(remaining);
    });

    if (wrapped.length > maxLines) {
      let last = wrapped[maxLines - 1] ?? "";
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      return [...wrapped.slice(0, maxLines - 1), `${last}…`];
    }
    return wrapped;
  };

  const fitSize = (text: string, size: number, maxWidth: number): number => {
    let fontSize = size;
    ctx.font = font(fontSize, true);
    while (ctx.measureText(text).width > maxWidth && fontSize > px(9)) {
      fontSize -= px(0.5);
      ctx.font = font(fontSize, true);
    }
    return fontSize;
  };

  const layout = (k: number, draw: boolean): number => {
    let y = top0;
    // Header: logo + centred company letterhead.
    const logoWidth = 10 * mm;
    const logoHeight = logo
      ? (logoWidth * logo.naturalHeight) / logo.naturalWidth
      : logoWidth;
    const b1 = px(13.5 * k);
    const b2 = px(10.5 * k);
    const textHeight = b1 * 1.2 + b2 * 1.2 * 2;
    const headerHeight = Math.max(logoHeight, textHeight);
    if (draw) {
      if (logo) {
        ctx.drawImage(
          logo,
          left,
          y + (headerHeight - logoHeight) / 2,
          logoWidth,
          logoHeight,
        );
      }
      const centerX = (left + logoWidth + 2 * mm + right) / 2;
      let textY = y + (headerHeight - textHeight) / 2;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = font(b1, true);
      ctx.fillText(letterhead.companyName, centerX, textY + b1 * 0.1);
      textY += b1 * 1.2;
      ctx.font = font(b2);
      ctx.fillText(letterhead.companyAddress, centerX, textY + b2 * 0.1);
      textY += b2 * 1.2;
      ctx.fillText(letterhead.madeIn, centerX, textY + b2 * 0.1);
    }
    y += headerHeight + 1 * mm;
    if (draw) ctx.fillRect(left, y, right - left, 0.3 * mm);
    y += 0.3 * mm + 1.2 * mm;

    // Info rows.
    const labelSize = px(11.5 * k);
    const valueSize = px(15 * k);
    const lineHeight = 1.18;
    const valueX = left + 19.5 * mm + 1.5 * mm;
    infoRows.forEach((row, index) => {
      let lines: string[];
      let valueSizeForRow = valueSize;
      if (row.mode === "nowrap") {
        valueSizeForRow = fitSize(row.value, px(14 * k), right - valueX);
        lines = [row.value];
      } else {
        ctx.font = font(valueSize, true);
        lines = wrap(row.value, right - valueX, STAMP_INFO_MAX_LINES);
      }
      const rowHeight =
        Math.max(valueSizeForRow, labelSize) * lineHeight * lines.length;
      if (draw) {
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const baseline = y + valueSizeForRow * lineHeight * 0.82;
        ctx.font = font(labelSize);
        ctx.fillText(`${row.label}:`, left, baseline);
        ctx.font = font(valueSizeForRow, true);
        lines.forEach((line, lineIndex) =>
          ctx.fillText(
            line,
            valueX,
            baseline + lineIndex * valueSizeForRow * lineHeight,
          ),
        );
      }
      y += rowHeight + (index < infoRows.length - 1 ? 0.6 * mm : 0);
    });

    y += 1.2 * mm;
    if (draw) ctx.fillRect(left, y, right - left, 0.3 * mm);
    y += 0.3 * mm + 1.2 * mm;

    // Bottom block: quantity/weight/week on the left, the QR on the right.
    const qrSize = qr ? 25 * mm : 0;
    const bottomValueX = left + 13 * mm + 1.5 * mm;
    const bottomColRight = right - qrSize - (qr ? 2 * mm : 0);
    const rowHeights = bottomRows.map(
      (row) => (row.big ? px(18 * k) : valueSize) * lineHeight,
    );
    const blockHeight =
      rowHeights.reduce((sum, h) => sum + h, 0) +
      0.6 * mm * Math.max(0, bottomRows.length - 1);
    const blockBoxHeight = Math.max(qrSize, blockHeight);
    if (draw) {
      if (qr) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          qr,
          right - qrSize,
          y + (blockBoxHeight - qrSize) / 2,
          qrSize,
          qrSize,
        );
        ctx.imageSmoothingEnabled = true;
      }
      let rowY = y + (blockBoxHeight - blockHeight) / 2;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      bottomRows.forEach((row, index) => {
        const hasLabel = row.label !== "";
        const valueX = hasLabel ? bottomValueX : left;
        const size = row.big
          ? fitSize(row.value, px(18 * k), bottomColRight - valueX)
          : valueSize;
        const baseline = rowY + rowHeights[index] * 0.82;
        if (hasLabel) {
          ctx.font = font(labelSize);
          ctx.fillText(`${row.label}:`, left, baseline);
        }
        ctx.font = font(size, true);
        ctx.fillText(row.value, valueX, baseline);
        rowY += rowHeights[index] + 0.6 * mm;
      });
    }
    y += blockBoxHeight;
    return y;
  };

  let k = 1;
  while (layout(k, false) > height - 2.5 * mm && k > STAMP_MIN_SCALE) {
    k = Number((k - STAMP_SCALE_STEP).toFixed(2));
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  layout(k, true);
  return canvas;
}
