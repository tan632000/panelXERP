/**
 * The font stacks every printed screen in the app uses. User rule (2026-10-05): everything the
 * app prints or exports to PDF — documents and fixed-size labels/stamps alike, canvas-drawn text
 * included — is Times New Roman.
 */

/** Quotations, slips, reports — anything meant to read as an office document. */
export const DOCUMENT_FONT_FAMILY = '"Times New Roman",Times,serif';

/** Box labels, calibration tags and other fixed-size stamps — the same Times New Roman stack. */
export const STAMP_FONT_FAMILY = DOCUMENT_FONT_FAMILY;
