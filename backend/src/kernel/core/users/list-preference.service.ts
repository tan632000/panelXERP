import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserListPreference } from '@kernel/core/users/entities/list-preference.entity';
import {
  LIST_PREFERENCE_MODULE_KEYS,
  isListPreferenceModuleKey,
  isPickerColumnWidthKey,
} from '@kernel/core/users/list-preference.constant';

export interface ListPreferenceResult {
  moduleKey: string;
  visibleColumns: string[];
  /** Last pinned column while scrolling sideways, or null when nothing is frozen. */
  frozenColumn: string | null;
  /** Width in pixels of each column the user dragged; empty keeps the declared widths. */
  columnWidths: Record<string, number>;
}

/**
 * Widest width a stored column may take, so a stray value cannot push a list off screen. No
 * floor beyond "positive": a drag locks every column at its rendered width, and a narrow icon
 * column renders under the table's own drag floor.
 */
const MAX_COLUMN_WIDTH = 4000;
/** More keys than any list declares columns; caps the size of a row a caller can write. */
const MAX_COLUMN_WIDTH_ENTRIES = 200;

@Injectable()
export class ListPreferenceService {
  constructor(
    @InjectRepository(UserListPreference)
    private readonly repo: Repository<UserListPreference>,
  ) {}

  /** The caller's own choice for one list, or null when they have never set one. */
  async findForUser(
    userId: number,
    moduleKey: string,
  ): Promise<ListPreferenceResult | null> {
    this.assertModuleKey(moduleKey);

    const stored = await this.repo.findOne({ where: { userId, moduleKey } });
    if (!stored) return null;

    return {
      moduleKey: stored.moduleKey,
      visibleColumns: stored.visibleColumns ?? [],
      frozenColumn: stored.frozenColumn ?? null,
      columnWidths: stored.columnWidths ?? {},
    };
  }

  /**
   * Upserts the caller's row.
   *
   * `userId` comes from the token and is the only user this can ever write: a payload naming
   * somebody else changes nothing, because the id is never read from the request.
   */
  async upsertForUser(
    userId: number,
    moduleKey: string,
    visibleColumns: unknown,
    frozenColumn?: unknown,
    columnWidths?: unknown,
  ): Promise<ListPreferenceResult> {
    this.assertModuleKey(moduleKey);
    const columns = this.assertColumns(visibleColumns);

    const stored = await this.repo.findOne({ where: { userId, moduleKey } });
    const row =
      stored ?? this.repo.create({ userId, moduleKey, createdAt: new Date() });

    row.visibleColumns = columns;
    // An absent field leaves the stored choice alone, so a caller writing only the
    // visibility list never silently unfreezes the columns.
    if (frozenColumn !== undefined) {
      row.frozenColumn = this.assertFrozenColumn(frozenColumn);
    }
    // Same rule for the widths: a visibility-only write keeps the layout the user dragged.
    if (columnWidths !== undefined) {
      row.columnWidths = this.assertColumnWidths(columnWidths);
    }
    row.updatedAt = new Date();
    const saved = await this.repo.save(row);

    return {
      moduleKey: saved.moduleKey,
      visibleColumns: saved.visibleColumns,
      frozenColumn: saved.frozenColumn ?? null,
      columnWidths: saved.columnWidths ?? {},
    };
  }

  private assertModuleKey(moduleKey: string): void {
    if (
      !isListPreferenceModuleKey(moduleKey) &&
      !isPickerColumnWidthKey(moduleKey)
    ) {
      throw new BadRequestException(
        `Unknown list module key. Known keys: ${LIST_PREFERENCE_MODULE_KEYS.join(', ')}`,
      );
    }
  }

  private assertColumns(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
      throw new BadRequestException(
        'visibleColumns must be an array of strings',
      );
    }
    return value as string[];
  }

  private assertFrozenColumn(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string' || value.length > 100) {
      throw new BadRequestException(
        'frozenColumn must be a column key of at most 100 characters, or null',
      );
    }
    return value;
  }

  private assertColumnWidths(value: unknown): Record<string, number> {
    const entries =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value)
        : null;
    if (
      !entries ||
      entries.length > MAX_COLUMN_WIDTH_ENTRIES ||
      entries.some(
        ([key, width]) =>
          key.length > 100 ||
          typeof width !== 'number' ||
          !Number.isFinite(width) ||
          width <= 0 ||
          width > MAX_COLUMN_WIDTH,
      )
    ) {
      throw new BadRequestException(
        `columnWidths must map column keys to positive widths of at most ${MAX_COLUMN_WIDTH} pixels`,
      );
    }
    // Sub-pixel widths come from measuring the rendered header. Rounded up, never down: a
    // column stored a fraction narrower than its content would wrap a title the user never
    // touched.
    return Object.fromEntries(
      entries.map(([key, width]) => [key, Math.ceil(width as number)]),
    );
  }
}
