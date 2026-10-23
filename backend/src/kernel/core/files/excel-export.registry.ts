import { Injectable } from '@nestjs/common';

import type { ExcelRow } from '@shared/services/excel-workbook.builder';

/**
 * Where an export job reads its rows. A feature registers one source when its module starts,
 * so the kernel worker can run the feature's own filtered read without importing the plugin.
 */
export interface ExcelExportSource {
  /** Row fields a client may ask this source to write; any other field is rejected. */
  allowedFields: readonly string[];
  /**
   * Every row matching `query`, in the list's order. `context` is what the feature route
   * stored when the export was requested, e.g. whether the caller may read prices.
   */
  fetchRows(
    query: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<ExcelRow[]>;
  /**
   * How many rows `fetchRows` would return for the same arguments, read cheaply so the worker
   * can refuse an export over the row cap before loading and projecting every row. Optional:
   * without it the cap is checked on the fetched rows.
   */
  countRows?(
    query: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<number>;
}

/**
 * Where a multi-sheet export job reads its rows: one row set per worksheet, for a screen that
 * shows several tables at once (e.g. a report) rather than one list.
 */
export interface ExcelMultiSheetExportSource {
  /** Row fields each row set may write, keyed by row-set key; any other key is rejected. */
  sheetFields: Readonly<Record<string, readonly string[]>>;
  /** Every row set for `query`, keyed as `sheetFields` is; a missing key reads as no rows. */
  fetchSheets(
    query: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<Record<string, ExcelRow[]>>;
}

@Injectable()
export class ExcelExportRegistry {
  private readonly sources = new Map<string, ExcelExportSource>();
  private readonly multiSheetSources = new Map<
    string,
    ExcelMultiSheetExportSource
  >();

  register(sourceKey: string, source: ExcelExportSource): void {
    this.assertFree(sourceKey);
    this.sources.set(sourceKey, source);
  }

  registerMultiSheet(
    sourceKey: string,
    source: ExcelMultiSheetExportSource,
  ): void {
    this.assertFree(sourceKey);
    this.multiSheetSources.set(sourceKey, source);
  }

  get(sourceKey: string): ExcelExportSource | undefined {
    return this.sources.get(sourceKey);
  }

  getMultiSheet(sourceKey: string): ExcelMultiSheetExportSource | undefined {
    return this.multiSheetSources.get(sourceKey);
  }

  private assertFree(sourceKey: string): void {
    if (this.sources.has(sourceKey) || this.multiSheetSources.has(sourceKey)) {
      throw new Error(
        `Excel export source "${sourceKey}" is already registered`,
      );
    }
  }
}
