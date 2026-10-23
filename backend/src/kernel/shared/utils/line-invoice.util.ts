import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { In } from 'typeorm';

import { matchesPermission } from '@kernel/core/auth/utils/permission-match.util';

import { canEditLineInvoices } from '@shared/constants/invoice-edit-roles';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { LineInvoiceDto } from '@shared/dto/update-line-invoices.dto';
import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';

/** The invoice fields a request carries, by the name the shared DTO gives them. */
export type LineInvoiceField = Exclude<keyof LineInvoiceDto, 'id'>;

/**
 * DTO field -> the line entity's own property, for the fields this document keeps. A field a
 * document does not keep (an NG line has no template/series) is simply absent, and ignored.
 */
export type LineInvoiceFieldMap = Partial<Record<LineInvoiceField, string>>;

/** Template + series are named `invoiceForm` / `invoiceSerial` on every warehouse receipt line. */
export const RECEIPT_LINE_INVOICE_FIELDS: LineInvoiceFieldMap = {
  invoiceNo: 'invoiceNo',
  invoiceDate: 'invoiceDate',
  invoiceForm: 'invoiceForm',
  invoiceSerial: 'invoiceSerial',
};

/** Receipt lines that keep only the invoice number and date (NG and TS). */
export const RECEIPT_LINE_INVOICE_NO_DATE_FIELDS: LineInvoiceFieldMap = {
  invoiceNo: 'invoiceNo',
  invoiceDate: 'invoiceDate',
};

export interface UpdateLineInvoicesOptions<Header, Line> {
  dataSource: DataSource;
  header: EntityTarget<Header>;
  line: EntityTarget<Line>;
  headerId: number;
  /** Line property pointing at the header, e.g. `rawMaterialReceiptId`. */
  headerKey: keyof Line & string;
  lines: LineInvoiceDto[];
  fields: LineInvoiceFieldMap;
  currentUser: AuthUserPayload;
  /**
   * The document's `<res>:invoice:write` scope — the permission matrix decides who may write
   * its invoices. When absent, the role list below applies (documents not yet migrated).
   */
  permission?: string;
  /** Roles allowed to write this document's invoices; defaults to {@link INVOICE_EDIT_ROLES}. */
  roles?: readonly string[];
}

/**
 * Writes only the invoice fields of a document's lines — customer feedback 2026-10-05: the
 * purchasing team fills the supplier's invoice on any delivery note or warehouse receipt, at
 * any status, and may change nothing else. The caller has already loaded the live header.
 */
export async function updateLineInvoices<
  Header extends ObjectLiteral,
  Line extends ObjectLiteral,
>(options: UpdateLineInvoicesOptions<Header, Line>): Promise<void> {
  const allowed = options.permission
    ? matchesPermission(
        options.currentUser.permissions ?? [],
        options.permission,
      )
    : canEditLineInvoices(options.currentUser.role, options.roles);
  if (!allowed) {
    throw new ForbiddenException(
      'You may not update invoice fields on this document.',
    );
  }

  const ids = options.lines.map((line) => line.id);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('A line may appear only once.');
  }

  await options.dataSource.transaction(async (manager) => {
    const lineRepo = manager.getRepository(options.line);
    const stored = await lineRepo.find({
      where: {
        id: In(ids),
        [options.headerKey]: options.headerId,
        isDeleted: false,
      } as never,
    });
    if (stored.length !== ids.length) {
      throw new BadRequestException(
        'Every line must be a live line of this document.',
      );
    }

    const byId = new Map(
      stored.map((line) => [
        Number((line as unknown as { id: number }).id),
        line,
      ]),
    );
    for (const submitted of options.lines) {
      const line = byId.get(submitted.id) as Record<string, unknown>;
      for (const [field, property] of Object.entries(options.fields) as Array<
        [LineInvoiceField, string]
      >) {
        const value = submitted[field];
        if (value === undefined) continue;
        line[property] =
          typeof value === 'string' ? value.trim() || null : null;
      }
      line.updatedBy = options.currentUser.userId;
    }
    await lineRepo.save(stored);

    await manager.getRepository(options.header).update(options.headerId, {
      updatedBy: options.currentUser.userId,
    } as never);
  });
}
