/**
 * Phone and tablet cards for the hand-built `<table>`s of a detail screen.
 *
 * A detail screen draws its lines with plain tables of its own rather than the list `Table`,
 * so it has no column definitions to build a card from. Instead each body cell is stamped with
 * the caption of the header above it, and the stylesheet (`[data-detail-cards]` in
 * `globals.css`) redraws every row as a card of captioned fields. The table itself is
 * untouched, so the desktop layout and every handler stay exactly as written.
 */

/** Marks a table the stylesheet redraws as cards: it has a header row to caption the cells. */
export const CARD_TABLE_ATTR = "data-card-table";
/** Set on a table, or any element around it, that must stay a table on a phone. */
export const NO_CARDS_ATTR = "data-no-cards";

const LABEL_ATTR = "data-label";
const WIDE_ATTR = "data-card-wide";
const INDEX_ATTR = "data-card-index";
const ACTIONS_ATTR = "data-card-actions";
const ICON_BUTTON_ATTR = "data-card-icon";
const CARD_LABEL_ATTR = "data-card-label";
const EMPTY_ATTR = "data-card-empty";

/** Header captions that name a running line number rather than a field. */
const INDEX_CAPTION = /^(#|stt|no\.?)$/i;

const ACTION_SELECTOR = 'button, a[href], [role="button"]';
/** A field the reader fills in, as opposed to a selection checkbox. */
const EDITABLE_CONTROL_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select';

function cellText(cell: Element): string {
  return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Walks rows the way the browser lays them out — a `rowSpan` cell holds its column in the
 * rows below, a `colSpan` cell spans several — and hands each cell its first column and width.
 */
function walkGrid(
  rows: ArrayLike<HTMLTableRowElement>,
  visit: (cell: HTMLTableCellElement, row: number, column: number) => void,
): void {
  const occupied: boolean[][] = [];
  Array.from(rows).forEach((tr, r) => {
    occupied[r] ??= [];
    let column = 0;
    Array.from(tr.cells).forEach((cell) => {
      while (occupied[r][column]) column += 1;
      const span = Math.max(1, cell.colSpan);
      const down = Math.max(1, cell.rowSpan);
      for (let dr = 0; dr < down; dr += 1) {
        occupied[r + dr] ??= [];
        for (let dc = 0; dc < span; dc += 1) {
          occupied[r + dr][column + dc] = true;
        }
      }
      visit(cell, r, column);
      column += span;
    });
  });
}

/**
 * One caption per column: a grouped header ("Invoice" over "No.", "Date") reads
 * "Invoice · No.", so two columns never share a caption.
 */
export function resolveHeaderCaptions(head: HTMLTableSectionElement): string[] {
  const levels: string[][] = [];
  walkGrid(head.rows, (cell, row, column) => {
    const text = cellText(cell);
    for (let dr = 0; dr < Math.max(1, cell.rowSpan); dr += 1) {
      for (let dc = 0; dc < Math.max(1, cell.colSpan); dc += 1) {
        (levels[column + dc] ??= [])[row + dr] = text;
      }
    }
  });
  return Array.from(levels, (level) =>
    (level ?? [])
      .filter((text, index, all) => text && text !== all[index - 1])
      .join(" · "),
  );
}

/** Captions every body and footer cell of one table, and marks the table for the stylesheet. */
export function labelCardTable(
  table: HTMLTableElement,
  shortActionLabel: (button: Element) => string | undefined,
): void {
  const head = table.tHead;
  if (!head || head.rows.length === 0) {
    table.removeAttribute(CARD_TABLE_ATTR);
    return;
  }
  const captions = resolveHeaderCaptions(head);
  const sections = [...Array.from(table.tBodies), table.tFoot].filter(
    (section): section is HTMLTableSectionElement => Boolean(section),
  );

  sections.forEach((section) => {
    const isFooter = section === table.tFoot;
    walkGrid(section.rows, (cell, _row, column) => {
      const span = Math.max(1, cell.colSpan);
      const caption = captions[column] ?? "";
      cell.removeAttribute(LABEL_ATTR);
      cell.removeAttribute(WIDE_ATTR);
      cell.removeAttribute(INDEX_ATTR);
      cell.removeAttribute(ACTIONS_ATTR);
      cell.removeAttribute(EMPTY_ATTR);

      // A placeholder kept `invisible` so the table's columns line up (no invoice on a line
      // that is not a purchase) is not a field of this line, so the card leaves it out.
      // So is a cell left blank because the field does not apply to this line (no invoice
      // before the line's inbound type is chosen).
      const children = Array.from(cell.children);
      if (
        children.every((child) => child.classList.contains("invisible")) &&
        (children.length > 0 || cellText(cell) === "")
      ) {
        cell.setAttribute(EMPTY_ATTR, "");
        return;
      }

      const actions = cell.querySelectorAll(ACTION_SELECTOR);
      // A cell of icon buttons only: the row's actions, drawn as a labelled button row. A
      // picker field also carries a button, but it holds an input the reader types into.
      if (
        actions.length > 0 &&
        cellText(cell) === "" &&
        !cell.querySelector(EDITABLE_CONTROL_SELECTOR)
      ) {
        cell.setAttribute(ACTIONS_ATTR, "");
        actions.forEach((action) => {
          if (cellText(action) !== "") return;
          action.setAttribute(ICON_BUTTON_ATTR, "");
          if (action.hasAttribute(CARD_LABEL_ATTR)) return;
          const label =
            shortActionLabel(action) ??
            action.getAttribute("title") ??
            action.getAttribute("aria-label");
          if (label) action.setAttribute(CARD_LABEL_ATTR, label);
        });
        return;
      }
      // A bare uncaptioned spacer (the remove column of a locked line) has nothing to show,
      // nor has a totals cell under a column that adds nothing up.
      if (
        (!caption || isFooter) &&
        span === 1 &&
        cellText(cell) === "" &&
        !cell.querySelector(`${EDITABLE_CONTROL_SELECTOR}, svg, img`)
      ) {
        cell.setAttribute(EMPTY_ATTR, "");
        return;
      }
      if (span > 1 || !caption) {
        // A total spanning several columns, an empty-state row, a header-less column.
        cell.setAttribute(WIDE_ATTR, "");
        return;
      }
      if (INDEX_CAPTION.test(caption)) {
        cell.setAttribute(
          INDEX_ATTR,
          /^\d+$/.test(cellText(cell)) ? "number" : "",
        );
        return;
      }
      cell.setAttribute(LABEL_ATTR, caption);
    });
  });
  table.setAttribute(CARD_TABLE_ATTR, "");
}

/** Captions every table under `root` that is not opted out, nor turned away by `accepts`. */
export function labelCardTables(
  root: HTMLElement,
  shortActionLabel: (button: Element) => string | undefined,
  accepts?: (table: HTMLTableElement) => boolean,
): void {
  root.querySelectorAll("table").forEach((table) => {
    if (table.closest(`[${NO_CARDS_ATTR}]`) || (accepts && !accepts(table))) {
      table.removeAttribute(CARD_TABLE_ATTR);
      return;
    }
    labelCardTable(table, shortActionLabel);
  });
}

/** A line editor of a form: a table whose rows hold the reader's own input fields. */
export function isEditableLineTable(table: HTMLTableElement): boolean {
  return Array.from(table.tBodies).some((body) =>
    body.querySelector(EDITABLE_CONTROL_SELECTOR),
  );
}

/** Marks a grid line editor (a `<div>` grid rather than a table) the stylesheet redraws as cards. */
export const CARD_GRID_ATTR = "data-card-grid";
const CARD_GRID_HEAD_ATTR = "data-card-grid-head";
const CARD_ROW_ATTR = "data-card-row";

/** Any field the reader sets, a selection checkbox or switch included. */
const ANY_CONTROL_SELECTOR =
  'input:not([type="hidden"]), textarea, select, [role="switch"], [role="checkbox"]';

/** Children of a grid row that never occupy a column of it. */
const NON_GRID_CHILD_SELECTOR =
  'input[type="hidden"], template, script, style, [hidden]';

/** The column track list a grid editor's header row and every line row share. */
function gridColumnsClass(element: Element): string | undefined {
  return Array.from(element.classList).find((name) =>
    name.startsWith("grid-cols-["),
  );
}

/**
 * Captions the grid line editors under `root`: a track whose first row is a grid of column
 * labels, followed by line rows built on the same `grid-cols-[…]` list. Each line cell gets
 * the label of the header cell above it, as `labelCardTable` does for a table.
 */
export function labelCardGrids(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".inline-block").forEach((track) => {
    const head = track.firstElementChild;
    const columns = head && gridColumnsClass(head);
    if (!head || !columns || track.closest(`[${NO_CARDS_ATTR}]`)) {
      track.removeAttribute(CARD_GRID_ATTR);
      return;
    }
    const captions = Array.from(head.children)
      .filter((cell) => !cell.matches(NON_GRID_CHILD_SELECTOR))
      .map(cellText);
    const rows = Array.from(track.querySelectorAll(".grid")).filter(
      (row) => row !== head && row.classList.contains(columns),
    );
    if (!rows.some((row) => row.querySelector(EDITABLE_CONTROL_SELECTOR))) {
      track.removeAttribute(CARD_GRID_ATTR);
      return;
    }
    head.setAttribute(CARD_GRID_HEAD_ATTR, "");
    rows.forEach((row) => {
      row.setAttribute(CARD_ROW_ATTR, "");
      // A hidden form value (a record id) is a child of the row but takes no grid column, so
      // counting it would hand every later cell the caption of the column before its own.
      Array.from(row.children)
        .filter((cell) => !cell.matches(NON_GRID_CHILD_SELECTOR))
        .forEach((cell, index) => {
          cell.removeAttribute(LABEL_ATTR);
          cell.removeAttribute(WIDE_ATTR);
          cell.removeAttribute(ACTIONS_ATTR);
          cell.removeAttribute(EMPTY_ATTR);
          const caption = captions[index] ?? "";
          // A lone checkbox or switch is still a field the reader sets, not a spacer.
          const hasControl = Boolean(cell.querySelector(ANY_CONTROL_SELECTOR));
          if (!hasControl && cellText(cell) === "") {
            if (
              cell.matches(ACTION_SELECTOR) ||
              cell.querySelector(ACTION_SELECTOR) ||
              // An icon standing in for the row's action (a lock where delete would be).
              (cell.hasAttribute("title") && cell.querySelector("svg"))
            ) {
              cell.setAttribute(ACTIONS_ATTR, "");
            }
            // A bare spacer holding the column of something not there yet (no file uploaded),
            // as opposed to an empty value box, which still draws its frame.
            else if (!cell.querySelector('[class*="border"], svg, img')) {
              cell.setAttribute(EMPTY_ATTR, "");
            } else cell.setAttribute(WIDE_ATTR, "");
            return;
          }
          if (caption) cell.setAttribute(LABEL_ATTR, caption);
          else cell.setAttribute(WIDE_ATTR, "");
        });
    });
    track.setAttribute(CARD_GRID_ATTR, "");
  });
}

/** Extra space under a caption, so a field sits level with one whose caption wraps. */
const CAPTION_PAD_VAR = "--card-caption-pad";

/**
 * Lines up the fields that share a row of a form card. A caption that wraps onto a second
 * line (a long multi-select caption) pushes its field below its neighbour's, so every caption
 * in the row is padded to the tallest. Measures, so it runs after the cards are laid out.
 */
export function alignCardCaptions(root: HTMLElement): void {
  const cells = Array.from(
    root.querySelectorAll<HTMLElement>(
      `[data-form-cards] :is(table[${CARD_TABLE_ATTR}], [${CARD_GRID_ATTR}]) [${LABEL_ATTR}]`,
    ),
  );
  cells.forEach((cell) => cell.style.removeProperty(CAPTION_PAD_VAR));

  // How far the cell's content starts below its own top: the caption and its spacing.
  const offsets = new Map<HTMLElement, number>();
  const rows = new Map<Element, Map<number, HTMLElement[]>>();
  cells.forEach((cell) => {
    // The first box laid out below the caption; a screen-reader-only label is taken out of flow.
    const content = Array.from(cell.children).find((child) => {
      const style = getComputedStyle(child);
      return (
        style.display !== "none" &&
        style.position !== "absolute" &&
        style.position !== "fixed"
      );
    });
    const card = cell.parentElement;
    if (!content || !card) return;
    const top = cell.getBoundingClientRect().top;
    offsets.set(cell, content.getBoundingClientRect().top - top);
    const cardRows = rows.get(card) ?? new Map<number, HTMLElement[]>();
    const row = cardRows.get(Math.round(top)) ?? [];
    row.push(cell);
    cardRows.set(Math.round(top), row);
    rows.set(card, cardRows);
  });

  [...rows.values()]
    .flatMap((cardRows) => [...cardRows.values()])
    .forEach((row) => {
      if (row.length < 2) return;
      const tallest = Math.max(...row.map((cell) => offsets.get(cell) ?? 0));
      row.forEach((cell) => {
        const pad = tallest - (offsets.get(cell) ?? tallest);
        if (pad > 0.5) cell.style.setProperty(CAPTION_PAD_VAR, `${pad}px`);
      });
    });
}

/**
 * Gives a whole card row to each captioned cell whose content does not fit half a card — a
 * group of several inputs, say — instead of letting it run over its neighbour. Measures, so
 * it runs after the stylesheet has laid the cards out.
 */
export function widenOverflowingCells(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>(
      `:is(table[${CARD_TABLE_ATTR}], [${CARD_GRID_ATTR}]) [${LABEL_ATTR}]:not([${WIDE_ATTR}])`,
    )
    .forEach((cell) => {
      if (cell.scrollWidth > cell.clientWidth + 1) {
        cell.setAttribute(WIDE_ATTR, "");
      }
    });
}
