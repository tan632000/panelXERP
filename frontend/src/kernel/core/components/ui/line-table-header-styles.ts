import { FORM_LABEL_TEXT_CLASS } from "./form-label-styles";

/**
 * Column labels of a create/edit modal's line table.
 *
 * Same weight and colour as a form field label, so the header reads like the labels above
 * it. Every line table takes them from here instead of spelling its own colour.
 */
export const LINE_TABLE_HEADER_TEXT_CLASS = FORM_LABEL_TEXT_CLASS;

/**
 * A column label's text: the same size, weight and colour as a form field's label
 * (`FormField`), never a smaller uppercase caption, so the line table reads like the form.
 */
export const LINE_TABLE_HEADER_LABEL_CLASS = `text-sm leading-tight ${LINE_TABLE_HEADER_TEXT_CLASS}`;

/** The header row of a line table: grey band, one line, form-label text. */
export const LINE_TABLE_HEADER_ROW_CLASS = `border-b border-border-secondary bg-surface-secondary whitespace-nowrap ${LINE_TABLE_HEADER_LABEL_CLASS}`;
