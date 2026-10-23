import { BadRequestException, ForbiddenException } from '@nestjs/common';

import {
  RECEIPT_LINE_INVOICE_NO_DATE_FIELDS,
  updateLineInvoices,
} from '@shared/utils/line-invoice.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { DataSource } from 'typeorm';

class Header {}
class Line {}

const PURCHASE_STAFF = { userId: 7, role: 'purchase_staff' } as AuthUserPayload;
const WAREHOUSE_KEEPER = {
  userId: 8,
  role: 'warehouse_keeper',
} as AuthUserPayload;

function storedLine(id: number) {
  return {
    id,
    receiptId: 1,
    quantity: '10',
    invoiceNo: 'OLD',
    invoiceDate: '2026-01-01',
    invoiceForm: '01GTKT',
    invoiceSerial: '1C26AA',
  };
}

function setup(stored: Array<ReturnType<typeof storedLine>>) {
  const lineRepo = {
    find: jest.fn().mockResolvedValue(stored),
    save: jest.fn().mockImplementation((rows: unknown) => rows),
  };
  const headerRepo = { update: jest.fn() };
  const manager = {
    getRepository: (target: unknown) =>
      target === Line ? lineRepo : headerRepo,
  };
  const dataSource = {
    transaction: (run: (m: typeof manager) => Promise<unknown>) => run(manager),
  } as unknown as DataSource;
  return { dataSource, lineRepo, headerRepo };
}

describe('updateLineInvoices', () => {
  it('writes only the invoice fields, and clears a blank one', async () => {
    const line = storedLine(11);
    const { dataSource, headerRepo } = setup([line]);

    await updateLineInvoices({
      dataSource,
      header: Header,
      line: Line,
      headerId: 1,
      headerKey: 'receiptId' as never,
      lines: [
        {
          id: 11,
          invoiceNo: ' HD-01 ',
          invoiceDate: '2026-10-01',
          invoiceForm: '',
        },
      ],
      fields: {
        invoiceNo: 'invoiceNo',
        invoiceDate: 'invoiceDate',
        invoiceForm: 'invoiceForm',
        invoiceSerial: 'invoiceSerial',
      },
      currentUser: PURCHASE_STAFF,
    });

    expect(line).toMatchObject({
      invoiceNo: 'HD-01',
      invoiceDate: '2026-10-01',
      invoiceForm: null,
      // Left out of the request, so it keeps its stored value.
      invoiceSerial: '1C26AA',
      quantity: '10',
      updatedBy: PURCHASE_STAFF.userId,
    });
    expect(headerRepo.update).toHaveBeenCalledWith(1, {
      updatedBy: PURCHASE_STAFF.userId,
    });
  });

  it('ignores a field the document does not keep', async () => {
    const line = storedLine(11);
    const { dataSource } = setup([line]);

    await updateLineInvoices({
      dataSource,
      header: Header,
      line: Line,
      headerId: 1,
      headerKey: 'receiptId' as never,
      lines: [{ id: 11, invoiceSerial: 'NEW' }],
      fields: RECEIPT_LINE_INVOICE_NO_DATE_FIELDS,
      currentUser: PURCHASE_STAFF,
    });

    expect(line.invoiceSerial).toBe('1C26AA');
  });

  it('refuses a role outside the purchasing team', async () => {
    const { dataSource, lineRepo } = setup([storedLine(11)]);

    await expect(
      updateLineInvoices({
        dataSource,
        header: Header,
        line: Line,
        headerId: 1,
        headerKey: 'receiptId' as never,
        lines: [{ id: 11, invoiceNo: 'X' }],
        fields: RECEIPT_LINE_INVOICE_NO_DATE_FIELDS,
        currentUser: WAREHOUSE_KEEPER,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(lineRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a line that is not a live line of the document', async () => {
    const { dataSource } = setup([]);

    await expect(
      updateLineInvoices({
        dataSource,
        header: Header,
        line: Line,
        headerId: 1,
        headerKey: 'receiptId' as never,
        lines: [{ id: 99, invoiceNo: 'X' }],
        fields: RECEIPT_LINE_INVOICE_NO_DATE_FIELDS,
        currentUser: PURCHASE_STAFF,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  describe('per-document invoice scope', () => {
    const SCOPE = 'raw_material_receipt_ok:invoice:write';
    const holder = (...permissions: string[]) =>
      ({ userId: 9, role: 'any_role', permissions }) as AuthUserPayload;

    const run = (currentUser: AuthUserPayload, permission?: string) => {
      const { dataSource, lineRepo } = setup([storedLine(11)]);
      const promise = updateLineInvoices({
        dataSource,
        header: Header,
        line: Line,
        headerId: 1,
        headerKey: 'receiptId' as never,
        lines: [{ id: 11, invoiceNo: 'X' }],
        fields: RECEIPT_LINE_INVOICE_NO_DATE_FIELDS,
        currentUser,
        permission,
      });
      return { promise, lineRepo };
    };

    it('lets any role holding the document scope update, whatever its code', async () => {
      await expect(run(holder(SCOPE), SCOPE).promise).resolves.toBeUndefined();
    });

    it('refuses a purchasing role that does not hold the scope', async () => {
      const refused = run(
        {
          userId: 7,
          role: 'purchase_staff',
          permissions: [],
        },
        SCOPE,
      );
      await expect(refused.promise).rejects.toThrow(ForbiddenException);
      expect(refused.lineRepo.save).not.toHaveBeenCalled();
    });

    it("does not accept another document's invoice scope", async () => {
      await expect(
        run(holder('xlbm_receipt_ok:invoice:write'), SCOPE).promise,
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the wildcard holders through', async () => {
      await expect(run(holder('*:*'), SCOPE).promise).resolves.toBeUndefined();
      await expect(
        run(holder('raw_material_receipt_ok:*'), SCOPE).promise,
      ).resolves.toBeUndefined();
    });

    it('keeps the role-list default when a document names no scope', async () => {
      await expect(run(WAREHOUSE_KEEPER).promise).rejects.toThrow(
        ForbiddenException,
      );
      await expect(run(PURCHASE_STAFF).promise).resolves.toBeUndefined();
    });
  });
});
