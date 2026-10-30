import { LINE_TABLE_HEADER_LABEL_CLASS } from "./line-table-header-styles";

/**
 * Cell and control metrics of a create/edit modal's line table.
 *
 * Every control in a row — plain input, number input, dropdown, date, record picker — is the
 * kernel's standard 38px field (`px-3 py-2 text-sm`), the same box as the header fields above
 * the table. A row therefore never mixes tall and short inputs, and the table reads like the
 * form around it. A cell sizes its column, never its control: no `h-9`, `text-xs`,
 * `size="sm"` or `!h-…` override on a field inside a line.
 */

/**
 * Column width of a line table, by what the column holds rather than by screen: a column
 * holding the same kind of value is the same width in every modal — wide enough for the
 * value, no wider. Set on the header cell; `table-fixed` carries it down the column.
 */
export const LINE_COL_WIDTH = {
  /** Row number. */
  index: "w-10",
  /** The remove-line button. */
  remove: "w-12",
  /**
   * A line-type dropdown. Sized for the longest receipt-type label (the return from the
   * production workshop) beside the clear button and the chevron, so no option is cut off.
   */
  select: "w-60",
  /** A record picker: lot, PO, source document, reference. */
  picker: "w-55",
  /** A code filled in from the picked record. */
  code: "w-35",
  /** A material, product or tool name. */
  name: "w-60",
  /** A supplier or customer. */
  party: "w-50",
  /** A classification badge or category. */
  classification: "w-35",
  /** A quantity, weight or stock figure. */
  quantity: "w-30",
  /** A unit of measure or a VAT rate. */
  unit: "w-20",
  /** A unit price. */
  price: "w-35",
  /** A goods, tax, discount or total amount: a grouped 13-digit VND figure in full. */
  amount: "w-37.5",
  /** A date. */
  date: "w-37.5",
  /** Free text that stays short: a spec, a grade, a hardness. */
  text: "w-37.5",
  invoiceNo: "w-35",
  invoiceForm: "w-27.5",
  invoiceSerial: "w-30",
  /** A free-text note. */
  note: "w-50",
} as const;

/** The bordered box around a line table; wide tables scroll sideways inside it. */
export const LINE_TABLE_SCROLL_CLASS =
  "scrollbar-thin overflow-x-auto rounded-lg border border-border-secondary";

/**
 * Header cell: grey band, the form-label text of `FormField`.
 *
 * Left-aligned for every column that holds a control, numeric ones included: the cell pads
 * the label exactly as it pads the control, so a label starts where its input starts, like a
 * form label above its field. A label wraps rather than spill into its neighbour under
 * `table-fixed`.
 */
const LINE_HEADER_CELL_BASE_CLASS = `border-b border-border-secondary bg-surface-secondary px-1.5 py-2 whitespace-normal ${LINE_TABLE_HEADER_LABEL_CLASS}`;

export const LINE_HEADER_CELL_CLASS = `${LINE_HEADER_CELL_BASE_CLASS} text-left`;

/** For a column with no control under it: the row number, the remove button. */
export const LINE_HEADER_CELL_CENTER_CLASS = `${LINE_HEADER_CELL_BASE_CLASS} text-center`;

/**
 * Body cell. `align-top`, not `align-middle`: a validation message renders under its own
 * control and makes that one cell taller, so centred controls would drift down by half the
 * message while the rest of the row stays put.
 */
export const LINE_CELL_CLASS =
  "border-b border-border-tertiary px-1.5 py-2 align-top";

/** An editable plain `<input>` in a line, matching `FormInput` exactly. */
export const LINE_INPUT_CLASS =
  "w-full min-w-0 rounded-md border border-border-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-[border,box-shadow] focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)] [font-family:inherit] disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-text-secondary";

/** The grey box of a value the reader cannot change, without a text colour. */
const LINE_READONLY_BOX_CLASS =
  "w-full min-w-0 rounded-md border border-border-secondary bg-surface-secondary px-3 py-2 text-sm outline-none [font-family:inherit]";

/** A value the reader cannot change, drawn in the same box as an editable one. */
export const LINE_INPUT_READONLY_CLASS = `${LINE_READONLY_BOX_CLASS} cursor-not-allowed text-text-secondary`;

/**
 * The read-only box for a figure that carries its own tone — stock in red, a total in green.
 *
 * It has no text colour; the caller adds one.
 */
export const LINE_INPUT_READONLY_TONE_CLASS = `${LINE_READONLY_BOX_CLASS} cursor-not-allowed`;

/**
 * A computed or auto-filled value of a line (name, supplier, classification, total) shown as
 * text in the read-only box, so every cell of a row is the same 38px box. A `<div>`, not an
 * input: the value stays readable text for assistive technology and tests, and an empty value
 * keeps the box height. Long values are cut with an ellipsis; pass the value as `title`.
 */
export const LINE_VALUE_BOX_CLASS = `${LINE_READONLY_BOX_CLASS} min-h-[38px] truncate text-text-secondary`;

/** `LINE_VALUE_BOX_CLASS` without a text colour, for a value that carries its own tone. */
export const LINE_VALUE_BOX_TONE_CLASS = `${LINE_READONLY_BOX_CLASS} min-h-[38px] truncate`;

export const LINE_INPUT_ERROR_CLASS =
  "border-danger-text focus:border-danger-text";

/** Numbers line up on their digits, so a column of quantities is comparable at a glance. */
export const LINE_NUMBER_CLASS = "text-right tabular-nums";

/**
 * Plain text in a line (row number, a computed figure, a label) centred on the 38px line of
 * the controls beside it.
 */
export const LINE_STATIC_TEXT_CLASS =
  "flex min-h-[38px] items-center text-sm text-text-primary";

/** The row-number cell's content, centred on the same 38px line. */
export const LINE_INDEX_TEXT_CLASS =
  "flex min-h-[38px] items-center justify-center font-mono text-xs text-text-tertiary";

export const LINE_ERROR_TEXT_CLASS =
  "mt-1 text-[11px] leading-tight text-danger-text";

export const LINE_HINT_TEXT_CLASS =
  "mt-1 text-[11px] leading-tight text-text-tertiary";
