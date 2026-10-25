import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { resolveLetterhead } from '@plugins/sales/quotation/config/quotation-letterhead.config';
import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';
import { QUOTATION_EXPORTABLE_STATUSES } from '@plugins/sales/quotation/enums/quotation-version-status.enum';
import {
  exportFileName,
  toRoman,
  vietnamDateParts,
  type QuotationDocument,
} from '@plugins/sales/quotation/utils/quotation-document.util';
import { renderQuotationPdf } from '@plugins/sales/quotation/utils/quotation-pdf.render';
import { loadVersionTree } from '@plugins/sales/quotation/utils/quotation-version.util';
import { renderQuotationXlsx } from '@plugins/sales/quotation/utils/quotation-xlsx.render';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const QUOTATION_LABEL = 'Quotation';
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF_CONTENT_TYPE = 'application/pdf';

/** A rendered quotation, ready to download. */
export interface QuotationExportFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}

/**
 * The customer-facing output of a quotation, in the layout of the company's BG sheet, as an
 * .xlsx and as a PDF. Both read the stored figures of the newest version, and only an approved
 * or customer-confirmed one: nothing a customer must not see yet is ever printed.
 */
@Injectable()
export class QuotationPdfService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly crm: CrmGateway,
    private readonly users: SalesUserLookup,
  ) {}

  async exportXlsx(
    id: number,
    actor: AuthUserPayload,
  ): Promise<QuotationExportFile> {
    const doc = await this.load(id, actor);
    return {
      fileName: exportFileName(doc.code, 'xlsx'),
      contentType: XLSX_CONTENT_TYPE,
      body: await renderQuotationXlsx(doc),
    };
  }

  async exportPdf(
    id: number,
    actor: AuthUserPayload,
  ): Promise<QuotationExportFile> {
    const doc = await this.load(id, actor);
    return {
      fileName: exportFileName(doc.code, 'pdf'),
      contentType: PDF_CONTENT_TYPE,
      body: await renderQuotationPdf(doc),
    };
  }

  /** 404 outside the data scope, 409 unless the newest version is approved or confirmed. */
  private async load(
    id: number,
    actor: AuthUserPayload,
  ): Promise<QuotationDocument> {
    const manager = this.dataSource.manager;
    const quotation = await manager
      .getRepository(Quotation)
      .findOne({ where: { id, isDeleted: false } });
    if (!quotation) throw new NotFoundException(`${QUOTATION_LABEL} not found`);
    const request = this.dataScope.assertVisible(
      actor,
      await manager.getRepository(SalesRequest).findOne({
        where: { id: quotation.requestId, isDeleted: false },
      }),
      QUOTATION_LABEL,
    );
    const version = await manager.getRepository(QuotationVersion).findOne({
      where: { quotationId: quotation.id, ver: quotation.latestVer },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (!QUOTATION_EXPORTABLE_STATUSES.includes(version.status)) {
      throw new ConflictException(
        `Version ${version.ver} is ${version.status}; only an approved or confirmed quotation can be exported.`,
      );
    }

    const [tree, customer, contact, sender] = await Promise.all([
      loadVersionTree(manager, version.id),
      this.crm.getCustomerSummary(request.customerId),
      request.contactId ? this.crm.getContactSummary(request.contactId) : null,
      this.users.contactOf(request.salesOwnerId),
    ]);

    const { dd, mm, yyyy } = vietnamDateParts(
      version.decidedAt ?? version.createdAt,
    );
    return {
      letterhead: resolveLetterhead(),
      code: quotation.code,
      customerName: customer?.name ?? '',
      quotedOn: `${dd}/${mm}/${yyyy}`,
      placeAndDate: `Hà Nội, Ngày ${dd} tháng ${mm} năm ${yyyy}`,
      recipient: {
        name: contact?.name ?? '',
        phone: contact?.phone ?? '',
        email: contact?.email ?? '',
      },
      sender: {
        name: sender?.fullName ?? '',
        phone: sender?.phone ?? '',
        email: sender?.email ?? '',
      },
      panels: tree.lines.map(({ line, bomLines }, index) => ({
        numeral: toRoman(index + 1),
        title: [line.tag, line.description].filter(Boolean).join(' - '),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        bomLines: bomLines.map((bom) => ({
          description: bom.itemName,
          code: bom.itemCode,
          brand: bom.itemBrand ?? '',
          unit: bom.itemUnit,
          quantity: bom.quantity,
        })),
      })),
      subtotal: version.subtotal,
      discountAmount: version.discountAmount,
      discountLabel:
        version.discountType === DiscountType.PERCENT
          ? `Chiết khấu ${version.discountValue}%`
          : 'Chiết khấu',
      vatRate: version.vatRate,
      vatAmount: version.vatAmount,
      total: version.total,
      terms: version.terms,
    };
  }
}
