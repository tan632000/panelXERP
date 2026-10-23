import { Injectable, type OnModuleInit } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { ExcelExportRegistry } from '@kernel/core/files/excel-export.registry';
import {
  USER_EXPORT_FIELDS,
  USER_EXPORT_SOURCE,
} from '@kernel/core/users/constants/user-export.constant';
import { UserFilterDto } from '@kernel/core/users/dto/user-filter.dto';
import { UsersService } from '@kernel/core/users/users.service';

import type { ExcelRow } from '@shared/services/excel-workbook.builder';

/** The application offset, as the rest of the backend fixes it (no timezone module yet). */
const APP_UTC_OFFSET_MINUTES = 7 * 60;

/** `DD/MM/YYYY HH:mm` in the application offset, the way the table prints the instant. */
function formatInstant(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + APP_UTC_OFFSET_MINUTES * 60_000);
  const part = (n: number) => String(n).padStart(2, '0');
  return (
    `${part(shifted.getUTCDate())}/${part(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()} ` +
    `${part(shifted.getUTCHours())}:${part(shifted.getUTCMinutes())}`
  );
}

/**
 * Hands the kernel Excel worker the account list's own read: every account matching the stored
 * filters, one row per account. Only the fields the table prints are projected, so no hash,
 * token or signature file can reach a sheet whatever the client's spec asks for.
 */
@Injectable()
export class UserExportSource implements OnModuleInit {
  constructor(
    private readonly registry: ExcelExportRegistry,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.registry.register(USER_EXPORT_SOURCE, {
      allowedFields: USER_EXPORT_FIELDS,
      fetchRows: (query) => this.fetchRows(query),
      countRows: (query) => this.countRows(query),
    });
  }

  async fetchRows(query: Record<string, unknown>): Promise<ExcelRow[]> {
    const rows = await this.users.findAllForExport(
      plainToInstance(UserFilterDto, query),
    );
    return rows.map((row) => ({
      username: row.username,
      fullName: row.fullName,
      email: row.email,
      roleName: row.roleName,
      department: row.department,
      phone: row.phone,
      title: row.title,
      // Written as the stored key; the sheet spec's label map turns it into the status text.
      isActive: row.isActive ? 'true' : 'false',
      lastLoginAt: formatInstant(row.lastLoginAt),
    }));
  }

  countRows(query: Record<string, unknown>): Promise<number> {
    return this.users.countForExport(plainToInstance(UserFilterDto, query));
  }
}
