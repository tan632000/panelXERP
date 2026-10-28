import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { DataSource, Repository } from 'typeorm';

import { isPostgresUniqueViolation } from '@shared/utils/db-error.util';

import { ITEM_REFERENCE_PRICE_MAX } from '@plugins/catalog/item/constants/item-limits.constant';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import {
  ITEM_GROUPS,
  type ItemGroup,
} from '@plugins/catalog/item/enums/item-group.enum';
import {
  assertXlsxUpload,
  normalizeHeader,
  readItemSheet,
  type ItemImportRawRow,
} from '@plugins/catalog/item/services/item-import.parser';
import { lockItemIdentifiers } from '@plugins/catalog/item/utils/item-identifier.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

export interface ItemImportRowError {
  /** 1-based sheet row. */
  row: number;
  field: string;
  reason: string;
}

export interface ItemImportResult {
  created: number;
  errors: ItemImportRowError[];
}

/** Template headers, the same Vietnamese ones the quotation layout uses. */
export const ITEM_IMPORT_TEMPLATE_HEADERS = [
  'STT',
  'MÔ TẢ',
  'MÃ HÀNG',
  'HÃNG SẢN XUẤT',
  'ĐV TÍNH',
  'ĐƠN GIÁ (VNĐ)',
  'NHÓM',
  'QUY CÁCH',
  'GHI CHÚ',
] as const;

const TOTALS_LABEL = /^tong( |$)/;
/** Digits with an optional 1-2 digit decimal part, `.` or `,` as the separator. */
const PLAIN_PRICE = /^\d+(?:[.,]\d{1,2})?$/;
/** Thousands-grouped digits (`1.500`, `1.500.000`, `1,500,000`). */
const GROUPED_PRICE = /^\d{1,3}(?:[.,]\d{3})+$/;
const ROMAN_NUMERAL = /^[ivxlcdm]+$/i;

type ImportCandidate = Pick<
  Item,
  | 'code'
  | 'name'
  | 'brand'
  | 'unit'
  | 'group'
  | 'specification'
  | 'referencePrice'
  | 'note'
> & { row: number };

/** A cell of `value` that is longer than the column allows, as a row error. */
function overLength(
  row: number,
  field: string,
  value: string,
  max: number,
): ItemImportRowError | null {
  return value.length > max
    ? { row, field, reason: `${field} must not exceed ${max} characters` }
    : null;
}

/** A price typed as text: plain digits or thousands-grouped digits, nothing else. */
function priceFromText(text: string): number | null {
  const trimmed = text.trim();
  if (PLAIN_PRICE.test(trimmed)) return Number(trimmed.replace(',', '.'));
  if (GROUPED_PRICE.test(trimmed)) return Number(trimmed.replace(/[.,]/g, ''));
  return null;
}

function parsePrice(
  raw: string | number | null,
): { value: number | null } | { error: string } {
  if (raw === null) return { value: null };
  const value = typeof raw === 'number' ? raw : priceFromText(raw);
  if (value === null || !Number.isFinite(value) || value < 0) {
    return { error: 'reference price must be a non-negative number' };
  }
  if (
    value > ITEM_REFERENCE_PRICE_MAX ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-6
  ) {
    return {
      error: 'reference price must have at most 2 decimals and fit 18 digits',
    };
  }
  return { value: Math.round(value * 100) / 100 };
}

@Injectable()
export class ItemImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
  ) {}

  /**
   * Imports a quotation-style workbook: every row is judged first, then all valid rows are
   * inserted in one transaction. Invalid rows are reported with their sheet row and the valid
   * ones are still created; a failure inside the insert rolls everything back.
   */
  async import(
    file: { originalname: string; buffer?: Buffer } | undefined,
    actor: AuthUserPayload,
  ): Promise<ItemImportResult> {
    const rows = await readItemSheet(assertXlsxUpload(file));
    const { candidates, errors } = this.judge(rows);
    await this.rejectActiveCodes(candidates, errors);

    const valid = candidates.filter(
      (candidate) => !errors.some((error) => error.row === candidate.row),
    );
    const created = await this.insertAll(valid, actor.userId);
    errors.sort((a, b) => a.row - b.row);
    return { created, errors };
  }

  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Items');
    sheet.addRow([...ITEM_IMPORT_TEMPLATE_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => (column.width = 20));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Pure row rules; also merges a code repeated with identical data into one candidate. */
  private judge(rows: ItemImportRawRow[]): {
    candidates: ImportCandidate[];
    errors: ItemImportRowError[];
  } {
    const candidates: ImportCandidate[] = [];
    const errors: ItemImportRowError[] = [];
    const firstByCode = new Map<string, ImportCandidate>();

    for (const raw of rows) {
      // A row without a code whose name or unit starts with the word "total" (Vietnamese) closes the item table;
      // notes and the signature block below it are footer. A coded row is always an item.
      if (
        !raw.code &&
        (TOTALS_LABEL.test(normalizeHeader(raw.name)) ||
          TOTALS_LABEL.test(normalizeHeader(raw.unit)))
      ) {
        break;
      }
      // Panel sections (I, II), sub-assemblies, totals and notes are not catalog items.
      if (ROMAN_NUMERAL.test(raw.ordinal)) continue;
      if (!raw.name || (!raw.code && !raw.unit)) continue;

      const rowErrors: ItemImportRowError[] = [];
      const fail = (field: string, reason: string) =>
        rowErrors.push({ row: raw.row, field, reason });

      if (!raw.code) fail('code', 'missing code');
      if (!raw.unit) fail('unit', 'missing unit');

      let group: ItemGroup = 'other';
      if (raw.group) {
        const match = ITEM_GROUPS.find(
          (value) => value === raw.group.toLowerCase(),
        );
        if (match) group = match;
        else fail('group', `group must be one of ${ITEM_GROUPS.join(', ')}`);
      }

      const price = parsePrice(raw.referencePrice);
      if ('error' in price) fail('referencePrice', price.error);

      for (const length of [
        overLength(raw.row, 'code', raw.code, 64),
        overLength(raw.row, 'name', raw.name, 255),
        overLength(raw.row, 'brand', raw.brand, 255),
        overLength(raw.row, 'unit', raw.unit, 20),
        overLength(raw.row, 'specification', raw.specification, 2000),
        overLength(raw.row, 'note', raw.note, 2000),
      ]) {
        if (length) rowErrors.push(length);
      }

      const key = raw.code.toLowerCase();
      const earlier = raw.code ? firstByCode.get(key) : undefined;
      if (earlier && rowErrors.length === 0) {
        const same =
          earlier.name === raw.name &&
          (earlier.brand ?? '') === raw.brand &&
          earlier.unit === raw.unit;
        if (!same) {
          fail(
            'code',
            `code repeated with different data (first used on row ${earlier.row})`,
          );
        }
        // Identical repeat: merged into the first occurrence, nothing to report.
        if (same) continue;
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }
      const candidate: ImportCandidate = {
        row: raw.row,
        code: raw.code,
        name: raw.name,
        brand: raw.brand || null,
        unit: raw.unit,
        group,
        specification: raw.specification || null,
        referencePrice: (price as { value: number | null }).value,
        note: raw.note || null,
      };
      firstByCode.set(key, candidate);
      candidates.push(candidate);
    }
    return { candidates, errors };
  }

  /**
   * A code already used by an active item, as its code or as its barcode, is a row error (both
   * unique indexes are case-insensitive, and a scan must resolve to one item).
   */
  private async rejectActiveCodes(
    candidates: ImportCandidate[],
    errors: ItemImportRowError[],
  ): Promise<void> {
    if (candidates.length === 0) return;
    const taken = await this.itemRepo
      .createQueryBuilder('item')
      .select(['item.code', 'item.barcode'])
      .where(
        '(LOWER(item.code) IN (:...codes) OR LOWER(item.barcode) IN (:...codes))',
        { codes: candidates.map((candidate) => candidate.code.toLowerCase()) },
      )
      .andWhere('item.isDeleted = false')
      .getMany();
    const takenCodes = new Set(taken.map((item) => item.code.toLowerCase()));
    const takenBarcodes = new Set(
      taken.flatMap((item) =>
        item.barcode ? [item.barcode.toLowerCase()] : [],
      ),
    );
    for (const candidate of candidates) {
      const key = candidate.code.toLowerCase();
      if (takenCodes.has(key)) {
        errors.push({
          row: candidate.row,
          field: 'code',
          reason: 'code already exists',
        });
      } else if (takenBarcodes.has(key)) {
        errors.push({
          row: candidate.row,
          field: 'code',
          reason: 'code is already the barcode of another item',
        });
      }
    }
  }

  /** One transaction, one INSERT; any failure leaves nothing behind. */
  private async insertAll(
    valid: ImportCandidate[],
    userId: number,
  ): Promise<number> {
    if (valid.length === 0) return 0;
    try {
      await this.dataSource.transaction(async (manager) => {
        // A barcode set to one of these codes by a concurrent request is only visible once it
        // commits, so queue behind its writer and look again before inserting.
        const codes = valid.map(({ code }) => code);
        await lockItemIdentifiers(manager, codes);
        const clash: unknown[] = await manager.query(
          `SELECT 1 FROM items
            WHERE is_deleted = false AND LOWER(barcode) = ANY($1::text[]) LIMIT 1`,
          [codes.map((code) => code.toLowerCase())],
        );
        if (clash.length > 0) {
          throw new ConflictException(
            'An item code was set as a barcode by someone else during the import; nothing was imported.',
          );
        }
        await manager.insert(
          Item,
          valid.map(({ row: _row, ...item }) => ({
            ...item,
            createdBy: userId,
            isDeleted: false,
          })),
        );
      });
    } catch (error: unknown) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException(
          'An item code was created by someone else during the import; nothing was imported.',
        );
      }
      throw error;
    }
    return valid.length;
  }
}
