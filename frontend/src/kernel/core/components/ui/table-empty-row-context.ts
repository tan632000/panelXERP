"use client";

import { createContext } from "react";

/**
 * True while the layout around a `Table` draws the empty state itself.
 *
 * `ListQueryBody` keeps the table rendered when a list comes back empty, so its header —
 * and with it the column filters and the bar that clears them — stays reachable, and shows
 * the icon and message below the header. The table must then not add a second empty row.
 */
export const TableEmptyRowOwnedContext = createContext(false);
