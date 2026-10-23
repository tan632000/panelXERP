import { escapeHtml } from "@/kernel/core/lib/print/html";

export interface SignBoxSigner {
  title: string;
  /** The signer's name; blank/missing prints `blankPlaceholder` (or a blank space) instead. */
  name?: string | null;
  /** `true` prints the signed-electronically note above the name instead of a blank signing line. */
  signed?: boolean;
  /**
   * The signer's stored e-signature image (a viewable URL). When `signed`, it prints in place of
   * the note — the quotation print-file pattern; a signer without one keeps the note.
   */
  signatureImageUrl?: string | null;
}

export interface SignBlockOptions {
  /** Label printed above the name when a signer's `signed` is true — the mock's electronic-
   * signature note. Required whenever a signer may be `signed`. */
  signedLabel: string;
  /** Placeholder for an unsigned box with no name yet — the mock's "sign and print your name"
   * prompt. Omitted leaves the blank line with nothing printed above it. */
  blankPlaceholder?: string;
  /** Empty leading grid columns before the signers — the mock's single-signer QC/Lab block,
   * which reserves the row's left half. */
  leadingBlankColumns?: number;
}

function buildSignBox(
  signer: SignBoxSigner,
  options: SignBlockOptions,
): string {
  const name = signer.name?.trim();
  const placeholder = options.blankPlaceholder
    ? escapeHtml(options.blankPlaceholder)
    : "&nbsp;";
  const signedMark = signer.signatureImageUrl
    ? `<div style="margin-top:6px;height:50px;display:flex;align-items:center;justify-content:center"><img src="${escapeHtml(signer.signatureImageUrl)}" alt="" style="max-height:50px;max-width:100%;object-fit:contain"></div>`
    : `<div style="margin-top:12px;font-style:italic;color:#166534;font-weight:700">${escapeHtml(options.signedLabel)}</div>`;
  const body = signer.signed
    ? `${signedMark}<div style="margin-top:8px;padding-top:6px;color:#111;font-weight:600">${name ? escapeHtml(name) : "&nbsp;"}</div>`
    : `<div style="border-top:1px solid #aaa;margin-top:50px;padding-top:6px;color:#555">${name ? escapeHtml(name) : placeholder}</div>`;
  return `<div style="text-align:center;font-size:11px"><b>${escapeHtml(signer.title)}</b>${body}</div>`;
}

/**
 * The signature grid every QC/Lab print file ends with (mock `_qcPFSignHTML` /
 * `_pfBlankSignHTML`): one box per signer, each either the blank signing line or — when the file
 * was saved with "use electronic signature" ticked — the signed-electronically note above the
 * signer's own name. `leadingBlankColumns` reproduces the single-signer Lab variant, which keeps
 * the row's left half empty instead of a second box.
 */
export function buildSignBlock(
  signers: SignBoxSigner[],
  options: SignBlockOptions,
): string {
  const leadingBlankColumns = options.leadingBlankColumns ?? 0;
  const leading = Array.from(
    { length: leadingBlankColumns },
    () => "<div></div>",
  ).join("");
  const columns = leadingBlankColumns + signers.length;
  const boxes = signers.map((signer) => buildSignBox(signer, options)).join("");
  return `<div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:20px;margin-top:28px;page-break-inside:avoid">${leading}${boxes}</div>`;
}
