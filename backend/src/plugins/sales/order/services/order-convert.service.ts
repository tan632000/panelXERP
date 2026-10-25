import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { DataScopeService } from '@shared/services/data-scope.service';

import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';
import { trimToNull } from '@plugins/sales/_shared/utils/text.util';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import {
  ORDER_CODE_PREFIX,
  ORDER_CODE_UNIQUE_INDEX,
  ORDER_CREATED_EVENT,
  ORDER_MANAGER_ROLE_CODES,
  ORDER_TABLE,
} from '@plugins/sales/order/constants/order.constant';
import { CreateOrderDto } from '@plugins/sales/order/dto/create-order.dto';
import { SalesOrderBomLine } from '@plugins/sales/order/entities/order-bom-line.entity';
import { SalesOrderLine } from '@plugins/sales/order/entities/order-line.entity';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';
import { ORDER_READ } from '@plugins/sales/order/permissions/order.permissions';
import {
  OrderService,
  type OrderDetail,
} from '@plugins/sales/order/services/order.service';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { QuotationVersionStatus } from '@plugins/sales/quotation/enums/quotation-version-status.enum';
import {
  lockQuotation,
  type LockedQuotation,
} from '@plugins/sales/quotation/utils/quotation-lock.util';
import { loadVersionTree } from '@plugins/sales/quotation/utils/quotation-version.util';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/**
 * Turns the customer-confirmed version of a quotation into its one order, copying the
 * customer, project, terms, lines and totals so the order never follows a later edit.
 *
 * One transaction takes the estimate `FOR SHARE`, then the request and the quotation header
 * `FOR UPDATE` (the order of every sales write), so two conversions of one quotation serialize and the second finds the
 * order the first made; the unique `quotation_id` index is the backstop. The request moves to
 * `won` in the same transaction; only the notice waits for the commit.
 */
@Injectable()
export class OrderConvertService {
  private readonly logger = new Logger(OrderConvertService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly orders: OrderService,
    private readonly crm: CrmGateway,
    private readonly statusPort: RequestStatusPort,
    private readonly notifications: NotificationService,
  ) {}

  async convert(
    dto: CreateOrderDto,
    actor: AuthUserPayload,
  ): Promise<OrderDetail> {
    const { order, locked } = await createWithDocumentCode(
      this.dataSource,
      {
        table: ORDER_TABLE,
        prefix: ORDER_CODE_PREFIX,
        codeUniqueIndex: ORDER_CODE_UNIQUE_INDEX,
        exhaustedMessage: 'Could not allocate an order code, please try again.',
      },
      async (manager, code) => {
        // The estimate comes first, shared, exactly as the quotation's own create takes it:
        // the order row's foreign key to the estimate would otherwise take a share of it
        // after the request lock, while every estimate write takes the estimate `FOR UPDATE`
        // and then waits for the request, a deadlock.
        const head = await manager.getRepository(Quotation).findOne({
          where: { id: dto.quotationId, isDeleted: false },
        });
        if (!head) throw new NotFoundException('Quotation not found');
        await manager.getRepository(Estimate).findOne({
          where: { id: head.estimateId },
          lock: { mode: 'pessimistic_read' },
        });
        const held = await lockQuotation(
          manager,
          this.dataScope,
          dto.quotationId,
          actor,
        );
        const { quotation, request, version } = held;
        if (version.status !== QuotationVersionStatus.CUSTOMER_CONFIRMED) {
          throw new ConflictException(
            `Version ${version.ver} is ${version.status}; only a customer-confirmed version becomes an order.`,
          );
        }
        // Cancelled orders count: a quotation is converted once, ever.
        const existing = await manager.getRepository(SalesOrder).exists({
          where: { quotationId: quotation.id },
          withDeleted: true,
        });
        if (existing) {
          throw new ConflictException(
            `Quotation ${quotation.code} already has an order.`,
          );
        }

        const [customer, project] = await Promise.all([
          this.crm.getCustomerSummary(request.customerId),
          request.projectId
            ? this.crm.getProjectSummary(request.projectId)
            : null,
        ]);
        if (!customer) {
          throw new ConflictException('The customer of the request is gone.');
        }

        const orderRepo = manager.getRepository(SalesOrder);
        const saved = await orderRepo.save(
          orderRepo.create({
            code,
            quotationId: quotation.id,
            quotationVersionId: version.id,
            quotationVer: version.ver,
            requestId: request.id,
            estimateId: quotation.estimateId,
            estimateRevisionId: version.estimateRevisionId,
            estimateRevision: version.estimateRevision,
            customerId: customer.id,
            customerName: customer.name,
            customerTaxCode: customer.taxCode,
            customerAddress: customer.address,
            projectId: project?.id ?? null,
            projectName: project?.name ?? null,
            contractNo: trimToNull(dto.contractNo),
            contractDate: dto.contractDate ?? null,
            deliveryDate: dto.deliveryDate ?? null,
            terms: [...version.terms],
            status: OrderStatus.OPEN,
            subtotal: version.subtotal,
            discountAmount: version.discountAmount,
            taxable: version.taxable,
            vatRate: version.vatRate,
            vatAmount: version.vatAmount,
            total: version.total,
            createdBy: actor.userId,
            isDeleted: false,
          }),
        );
        await this.copyLines(manager, saved.id, version.id);
        await this.statusPort.advance(manager, request.id, RequestStatus.WON, {
          actorId: actor.userId,
          note: code,
        });
        await recordRequestActivity(manager, {
          requestId: request.id,
          action: 'order_created',
          actorId: actor.userId,
          note: code,
        });
        return { order: saved, locked: held };
      },
    );

    await this.notify(order, locked, actor);
    return this.orders.findOne(order.id, actor);
  }

  /** Copies the version's panel lines and their BOM; the copies never refer back. */
  private async copyLines(
    manager: EntityManager,
    orderId: number,
    versionId: number,
  ): Promise<void> {
    const tree = await loadVersionTree(manager, versionId);
    const lineRepo = manager.getRepository(SalesOrderLine);
    for (const { line, bomLines } of tree.lines) {
      const copy = await lineRepo.save(
        lineRepo.create({
          orderId,
          tag: line.tag,
          description: line.description ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount,
        }),
      );
      if (bomLines.length === 0) continue;
      await manager.getRepository(SalesOrderBomLine).insert(
        bomLines.map((bom) => ({
          lineId: copy.id,
          itemCode: bom.itemCode,
          itemName: bom.itemName,
          itemBrand: bom.itemBrand ?? null,
          itemUnit: bom.itemUnit,
          quantity: bom.quantity,
        })),
      );
    }
  }

  /**
   * After the commit; a failed notice must not undo a committed order. The order managers are
   * told, and the sales owner too when somebody else converted it.
   */
  private async notify(
    order: SalesOrder,
    { quotation, request }: LockedQuotation,
    actor: AuthUserPayload,
  ): Promise<void> {
    const base = {
      eventType: ORDER_CREATED_EVENT,
      message: `${order.code} — ${request.code}`,
      requiredScope: ORDER_READ,
      link: `/sales/orders/${order.id}`,
      payload: {
        orderId: order.id,
        code: order.code,
        quotationId: quotation.id,
        quotationCode: quotation.code,
        requestId: request.id,
        requestCode: request.code,
      },
      createdBy: actor.userId,
    };
    try {
      await this.notifications.emit({
        ...base,
        roleCodes: [...ORDER_MANAGER_ROLE_CODES],
        // The owner gets the one notice below, even when they also hold a manager role.
        excludeUserIds: [actor.userId, request.salesOwnerId],
      });
      if (request.salesOwnerId !== actor.userId) {
        await this.notifications.emit({
          ...base,
          roleCodes: [],
          userIds: [request.salesOwnerId],
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        `Could not send the ${ORDER_CREATED_EVENT} notice of order ${order.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
