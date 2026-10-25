import { ConflictException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { DEFAULT_QUOTATION_TERMS } from '@plugins/sales/quotation/constants/quotation.constant';
import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';
import {
  describeWithDatabase,
  openQuotationDb,
  type PanelSpec,
  type QuotationDb,
} from '@plugins/sales/quotation/quotation-db.helper-spec';

jest.setTimeout(60_000);

/** Worked example: two panels, 5% discount, 8% VAT → total 3,363,511. */
const WORKED_PANELS: PanelSpec[] = [
  { tag: 'MSB-01', quantity: 2, unitCost: 1_234_567 },
  { tag: 'DB-02', quantity: 1, unitCost: 500_000 },
];
const HEADER = [
  'STT',
  'MÔ TẢ',
  'MÃ HÀNG',
  'HÃNG SẢN XUẤT',
  'ĐV TÍNH',
  'SỐ LƯỢNG',
  'Đơn giá (VNĐ)',
  'Thành tiền (VNĐ)',
];

/**
 * The customer-facing output against the real Postgres of the compose stack: the .xlsx follows
 * the BG sheet row by row and carries the stored totals, the PDF renders with a Unicode font,
 * and nothing is exported before approval.
 */
describeWithDatabase('Quotation export against Postgres', () => {
  let db: QuotationDb;

  beforeAll(async () => {
    db = await openQuotationDb([Customer, Project, Contact, Item]);
  });
  afterEach(async () => {
    await db.cleanup();
  });
  afterAll(async () => {
    await db?.close();
  });

  /** An approved quotation priced as the worked example, its request given a contact. */
  const approvedQuotation = async (discount = 5) => {
    const estimated = await db.estimatedRequest(WORKED_PANELS);
    await db.addContact(estimated.requestId, {
      name: 'Nguyễn Văn An',
      phone: '0911222333',
      email: 'an@customer.test',
    });
    const created = await db.quotations.create(
      { requestId: estimated.requestId },
      db.salesA,
    );
    await db.versions.updatePricing(
      created.id,
      {
        lines: [
          { lineId: created.current.lines[0].id, marginPercent: 12.5 },
          { lineId: created.current.lines[1].id, marginPercent: 0.1 },
        ],
        discountType: DiscountType.PERCENT,
        discountValue: discount,
        vatRate: 8,
      },
      db.salesA,
    );
    await db.approvals.submit(created.id, db.salesA);
    await db.approvals.approve(created.id, db.manager);
    return { ...estimated, id: created.id, code: created.code };
  };

  const sheetOf = async (body: Buffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    return workbook.worksheets[0];
  };
  const cellText = (value: ExcelJS.CellValue): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  /** The row whose cell in `column` reads `label`. */
  const rowLabelled = (
    sheet: ExcelJS.Worksheet,
    column: string,
    label: string,
  ) => {
    let found: ExcelJS.Row | undefined;
    sheet.eachRow((row) => {
      if (cellText(row.getCell(column).value) === label) found = row;
    });
    return found;
  };

  describe('xlsx', () => {
    it('writes the letterhead, parties and the header row of the company sheet', async () => {
      const { id, code } = await approvedQuotation();

      const file = await db.exports.exportXlsx(id, db.salesA);
      const sheet = await sheetOf(file.body);

      expect(file.fileName.endsWith('.xlsx')).toBe(true);
      expect(file.fileName).not.toContain('/');
      expect(sheet.getCell('A1').value).toBe('CÔNG TY TNHH KỸ THUẬT TRÍ VINH');
      expect(sheet.getCell('A2').value).toBe(
        'VP: LK2-09 KĐT Duyên Thái, Xã Ngọc Hồi, TP. Hà Nội',
      );
      expect(sheet.getCell('A3').value).toBe(
        'Website: trivinhtech.com.  MST: 0107729395',
      );
      expect(cellText(sheet.getCell('A4').value)).toContain('19131127871017');
      expect(cellText(sheet.getCell('A4').value)).toContain('700037556395');
      expect(sheet.getCell('A5').value).toBe('BẢNG CHÀO GIÁ');
      expect(sheet.getCell('A6').value).toBe(`Số: ${code}`);
      expect(sheet.getCell('A7').value).toBe('Kính gửi: Customer');
      expect(sheet.getCell('A8').value).toBe('Người nhận: Nguyễn Văn An');
      expect(sheet.getCell('A9').value).toBe('Điện thoại: 0911222333');
      expect(sheet.getCell('A10').value).toBe('Email: an@customer.test');
      expect(sheet.getCell('E8').value).toBe('Người gửi: Sales A');
      expect(sheet.getCell('E9').value).toBe('Điện thoại: 0900000001');
      expect(sheet.getCell('E10').value).toBe('Email: sales.a@example.test');
      expect(sheet.getCell('E7').value).toBe('Ngày báo giá:');
      expect(cellText(sheet.getCell('F7').value)).toMatch(
        /^\d{2}\/\d{2}\/\d{4}$/,
      );
      expect(
        (sheet.getRow(13).values as ExcelJS.CellValue[]).slice(1, 9),
      ).toEqual(HEADER);
      expect(sheet.getImages()).toHaveLength(1);
    });

    it('writes one Roman-numbered row per panel with its unit price, amount and BOM below', async () => {
      const { id } = await approvedQuotation();

      const sheet = await sheetOf(
        (await db.exports.exportXlsx(id, db.salesA)).body,
      );

      const first = sheet.getRow(14);
      expect(first.getCell('A').value).toBe('I');
      expect(first.getCell('B').value).toBe('MSB-01');
      expect(first.getCell('F').value).toBe(2);
      expect(first.getCell('G').value).toBe(1_388_888);
      expect(first.getCell('H').value).toBe(2_777_776);
      const bom = sheet.getRow(15);
      expect(bom.getCell('A').value).toBeFalsy();
      expect(cellText(bom.getCell('B').value)).toBe('QT spec item');
      expect(cellText(bom.getCell('C').value)).toMatch(/^QT-/);
      expect(bom.getCell('E').value).toBe('Cái');
      expect(bom.getCell('F').value).toBe(1);
      const second = sheet.getRow(16);
      expect(second.getCell('A').value).toBe('II');
      expect(second.getCell('B').value).toBe('DB-02');
      expect(second.getCell('G').value).toBe(500_500);
      expect(second.getCell('H').value).toBe(500_500);

      const numerals: string[] = [];
      sheet.eachRow((row) => {
        const text = cellText(row.getCell('A').value);
        if (/^[IVXLC]+$/.test(text)) numerals.push(text);
      });
      expect(numerals).toEqual(['I', 'II']);
    });

    it('writes the discount, VAT and total rows as the version stores them', async () => {
      const { id } = await approvedQuotation(5);

      const sheet = await sheetOf(
        (await db.exports.exportXlsx(id, db.salesA)).body,
      );

      const valueOf = (label: string) =>
        rowLabelled(sheet, 'E', label)?.getCell('G').value;
      expect(valueOf('Tổng')).toBe(3_278_276);
      expect(valueOf('Chiết khấu 5%')).toBe(163_914);
      expect(valueOf('Thuế VAT 8%')).toBe(249_149);
      expect(valueOf('Tổng sau thuế')).toBe(3_363_511);
    });

    it('leaves the discount row out when there is no discount', async () => {
      const { id } = await approvedQuotation(0);

      const sheet = await sheetOf(
        (await db.exports.exportXlsx(id, db.salesA)).body,
      );

      let discountRows = 0;
      sheet.eachRow((row) => {
        if (cellText(row.getCell('E').value).startsWith('Chiết khấu')) {
          discountRows += 1;
        }
      });
      expect(discountRows).toBe(0);
      expect(rowLabelled(sheet, 'E', 'Tổng sau thuế')?.getCell('G').value).toBe(
        3_278_276 + 262_262,
      );
    });

    it('writes the numbered terms, the order confirmation and the place and date', async () => {
      const { id } = await approvedQuotation();

      const sheet = await sheetOf(
        (await db.exports.exportXlsx(id, db.salesA)).body,
      );

      expect(rowLabelled(sheet, 'A', 'Ghi chú:')).toBeDefined();
      DEFAULT_QUOTATION_TERMS.forEach((term, index) => {
        const row = rowLabelled(sheet, 'A', `${index + 1}.`);
        expect(cellText(row?.getCell('B').value)).toBe(term);
      });
      expect(rowLabelled(sheet, 'B', 'Xác nhận đặt hàng')).toBeDefined();
      expect(
        cellText(
          rowLabelled(sheet, 'B', 'Xác nhận đặt hàng')?.getCell('E').value,
        ),
      ).toMatch(/^Hà Nội, Ngày \d{2} tháng \d{2} năm \d{4}$/);
    });

    it('prints the terms the draft was given, not the defaults', async () => {
      const estimated = await db.estimatedRequest(WORKED_PANELS);
      const created = await db.quotations.create(
        { requestId: estimated.requestId },
        db.salesA,
      );
      await db.versions.updatePricing(
        created.id,
        { terms: ['Delivery in 3 weeks', 'Payment on delivery'] },
        db.salesA,
      );
      await db.approvals.submit(created.id, db.salesA);
      await db.approvals.approve(created.id, db.manager);

      const sheet = await sheetOf(
        (await db.exports.exportXlsx(created.id, db.salesA)).body,
      );

      expect(cellText(rowLabelled(sheet, 'A', '1.')?.getCell('B').value)).toBe(
        'Delivery in 3 weeks',
      );
      expect(cellText(rowLabelled(sheet, 'A', '2.')?.getCell('B').value)).toBe(
        'Payment on delivery',
      );
      expect(rowLabelled(sheet, 'A', '3.')).toBeUndefined();
    });

    it('exports a customer-confirmed version too', async () => {
      const { id } = await approvedQuotation();
      await db.approvals.confirm(id, db.salesA);

      const file = await db.exports.exportXlsx(id, db.salesA);

      expect(file.body.length).toBeGreaterThan(0);
    });
  });

  describe('pdf', () => {
    it('renders a PDF in the Unicode font', async () => {
      const { id, code } = await approvedQuotation();

      const file = await db.exports.exportPdf(id, db.salesA);

      expect(file.contentType).toBe('application/pdf');
      expect(file.fileName).toBe(`${code.replace('/', '-')}.pdf`);
      expect(file.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(file.body.length).toBeGreaterThan(5_000);
      // The embedded font's name is stored in clear in the font descriptor.
      expect(file.body.toString('latin1')).toContain('BeVietnamPro');
    });

    it('breaks a long table over pages without failing', async () => {
      const panels: PanelSpec[] = Array.from({ length: 25 }, (_, index) => ({
        tag: `TU-${index + 1}`,
        quantity: 1,
        unitCost: 1000 + index,
      }));
      const estimated = await db.estimatedRequest(panels);
      const created = await db.quotations.create(
        { requestId: estimated.requestId },
        db.salesA,
      );
      await db.approvals.submit(created.id, db.salesA);
      await db.approvals.approve(created.id, db.manager);

      const file = await db.exports.exportPdf(created.id, db.salesA);

      expect(file.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(
        file.body.toString('latin1').match(/\/Type \/Page\b/g)?.length,
      ).toBeGreaterThan(1);
    });
  });

  describe('before approval and outside the scope', () => {
    /** Both formats refuse with the same error, one after the other. */
    const expectBothRefused = async (
      id: number,
      actor: QuotationDb['salesA'],
      error: new (...args: never[]) => Error,
    ) => {
      await expect(db.exports.exportXlsx(id, actor)).rejects.toBeInstanceOf(
        error,
      );
      await expect(db.exports.exportPdf(id, actor)).rejects.toBeInstanceOf(
        error,
      );
    };

    it.each(['draft', 'pending_approval', 'rejected', 'cancelled'])(
      'answers 409 to a %s version, in both formats',
      async (status) => {
        const estimated = await db.estimatedRequest(WORKED_PANELS);
        const created = await db.quotations.create(
          { requestId: estimated.requestId },
          db.salesA,
        );
        await db.dataSource.query(
          `UPDATE sales_quotation_versions SET status = $2 WHERE quotation_id = $1`,
          [created.id, status],
        );

        await expectBothRefused(created.id, db.salesA, ConflictException);
      },
    );

    it('answers 404 to a sales who does not own the request, and to an unknown quotation', async () => {
      const { id } = await approvedQuotation();

      await expectBothRefused(id, db.salesB, NotFoundException);
      await expectBothRefused(2_000_000_000, db.salesA, NotFoundException);
    });

    it('lets a manager export any approved quotation', async () => {
      const { id } = await approvedQuotation();

      const file = await db.exports.exportPdf(id, db.manager);

      expect(file.body.length).toBeGreaterThan(0);
    });
  });
});
