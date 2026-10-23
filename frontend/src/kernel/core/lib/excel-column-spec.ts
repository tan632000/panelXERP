import { resolveColumnFilterLabel } from "@/kernel/core/lib/table-column-filter";
import { normalizeHeaderGroup } from "@/kernel/core/lib/table-header-groups";

import type {
  ExcelColumnSpec,
  ExcelColumnValue,
  ExcelSheetSpec,
} from "@/kernel/core/types/excel";
import type React from "react";

/** The parts of a table column the Excel spec reads. */
export interface ExcelSpecColumn {
  key: string;
  header?: React.ReactNode;
  headerGroup?: string | string[];
  export?: ExcelColumnValue | false;
  groupSpan?: boolean;
  hideable?: boolean;
  style?: React.CSSProperties;
  /** Whether this column must hold a value on every import row. */
  required?: boolean;
}

/** Roughly how many CSS pixels one Excel character-width unit takes. */
const PIXELS_PER_EXCEL_CHAR = 7;

function excelWidth(
  style: React.CSSProperties | undefined,
): number | undefined {
  const raw = style?.width ?? style?.minWidth;
  const pixels = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  if (typeof pixels !== "number" || !Number.isFinite(pixels)) {
    return undefined;
  }
  return Math.min(80, Math.max(4, Math.round(pixels / PIXELS_PER_EXCEL_CHAR)));
}

/**
 * The columns a table actually draws: the accessible ones, minus the hideable ones this
 * account hid. The same rule `Table` applies, so an export never holds a column the reader
 * cannot see on screen.
 */
export function visibleTableColumns<T extends ExcelSpecColumn>(
  accessibleColumns: readonly T[],
  isVisible: (key: string) => boolean,
): T[] {
  return accessibleColumns.filter(
    (column) => !(column.hideable ?? true) || isVisible(column.key),
  );
}

/**
 * Serializes table columns into the sheet spec the backend lays the file out from (C1).
 *
 * The label is the header text the table draws, never a field name. A column without header
 * text (the actions column, a selection or settings cell) or one declaring `export: false`
 * is left out.
 */
export function buildExcelColumnSpec(
  columns: readonly ExcelSpecColumn[],
  options: { rowGroupField?: string; sheetName?: string } = {},
): ExcelSheetSpec {
  const specColumns: ExcelColumnSpec[] = [];
  for (const column of columns) {
    if (column.export === false) continue;
    const label = resolveColumnFilterLabel(column);
    if (!label) continue;

    const value = column.export ?? {};
    const headerGroup = normalizeHeaderGroup(column.headerGroup);
    const width = excelWidth(column.style);
    specColumns.push({
      key: column.key,
      label,
      ...(headerGroup.length > 0 ? { headerGroup } : {}),
      ...(value.fields ? { fields: value.fields } : {}),
      ...(value.combine ? { combine: value.combine } : {}),
      ...(value.joinWith !== undefined ? { joinWith: value.joinWith } : {}),
      ...(value.numberFormat ? { numberFormat: value.numberFormat } : {}),
      ...(column.groupSpan ? { groupSpan: true } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(column.required ? { required: true } : {}),
    });
  }

  return {
    columns: specColumns,
    ...(options.rowGroupField ? { rowGroupField: options.rowGroupField } : {}),
    ...(options.sheetName ? { sheetName: options.sheetName } : {}),
  };
}
