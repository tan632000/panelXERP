import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';

import { DataScopeService } from '@shared/services/data-scope.service';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { OrderLifecycleRegistry } from '@plugins/sales/_shared/ports/order-lifecycle-registry';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { SalesOrderBomLine } from '@plugins/sales/order/entities/order-bom-line.entity';
import { SalesOrderLine } from '@plugins/sales/order/entities/order-line.entity';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { OrderConvertService } from '@plugins/sales/order/services/order-convert.service';
import { OrderEditService } from '@plugins/sales/order/services/order-edit.service';
import { OrderService } from '@plugins/sales/order/services/order.service';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import {
  describeWithDatabase,
  openQuotationDb,
  type QuotationDb,
} from '@plugins/sales/quotation/quotation-db.helper-spec';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

jest.setTimeout(60_000);

interface UpdateRow {
  role_codes: string[];
  user_ids: number[];
  exclude_user_ids: number[];
  required_scope: string;
  link: string;
  payload: Record<string, unknown>;
}

/**
 * The notices an order edit or cancel sends its followers, against the real Postgres of the
 * compose stack: who is told, never the actor, nothing for a save that changes nothing, and
 * nothing left behind when the cancel rolls back. Orders are built through the real services.
 */
describeWithDatabase('Order follower notices on edit and cancel', () => {
  let db: QuotationDb;
  let convert: OrderConvertService;
  let edit: OrderEditService;
  let failHook = false;

  beforeAll(async () => {
    db = await openQuotationDb([
      Customer,
      Project,
      Contact,
      Item,
      Notification,
      SalesOrder,
      SalesOrderLine,
      SalesOrderBomLine,
    ]);
    const dataScope = new DataScopeService();
    const statusPort = new RequestStatusPort();
    const crm = {
      getCustomerSummary: async (id: number) => {
        const [row]: Array<{
          id: number;
          name: string;
          tax_code: string | null;
          address: string | null;
        }> = await db.dataSource.query(
          `SELECT id, name, tax_code, address FROM customers WHERE id = $1`,
          [id],
        );
        return {
          id: row.id,
          name: row.name,
          taxCode: row.tax_code,
          address: row.address,
        };
      },
      getProjectSummary: () => Promise.resolve(null),
    };
    const users = { namesOf: () => Promise.resolve(new Map<number, string>()) };
    const orders = new OrderService(
      db.dataSource.getRepository(SalesOrder),
      db.dataSource.getRepository(SalesOrderLine),
      db.dataSource.getRepository(SalesOrderBomLine),
      db.dataSource.getRepository(SalesRequest),
      db.dataSource.getRepository(Estimate),
      db.dataSource.getRepository(Quotation),
      dataScope,
      users as never,
    );
    const lifecycle = new OrderLifecycleRegistry();
    lifecycle.register('spec', {
      onCancelled: () => {
        if (failHook) throw new Error('Stock hook failed.');
        return Promise.resolve({ changedOrderIds: [], touchedItemIds: [] });
      },
    });
    convert = new OrderConvertService(
      db.dataSource,
      dataScope,
      orders,
      crm as never,
      statusPort,
      db.notifications as never,
      lifecycle,
    );
    edit = new OrderEditService(
      db.dataSource,
      dataScope,
      orders,
      statusPort,
      lifecycle,
      // Emit uses only the notification table.
      new OrderFollowerNotifier(
        new NotificationService(
          db.dataSource.getRepository(Notification),
          null as never,
          null as never,
        ),
        new OrderMaterialReadPort(),
        db.dataSource,
      ),
    );
  });
  afterEach(async () => {
    failHook = false;
    await db.dataSource.query(
      `DELETE FROM notifications WHERE event_type = 'sales.order.updated'
          AND (payload->>'orderId')::int IN (SELECT id FROM sales_orders WHERE customer_id = $1)`,
      [db.customerId],
    );
    await db.cleanup();
  });
  afterAll(async () => {
    await db?.close();
  });

  const openOrder = async () => {
    const estimated = await db.estimatedRequest();
    const quotation = await db.quotations.create(
      { requestId: estimated.requestId },
      db.salesA,
    );
    await db.approvals.submit(quotation.id, db.salesA);
    await db.approvals.approve(quotation.id, db.manager);
    await db.approvals.confirm(quotation.id, db.salesA);
    return convert.convert({ quotationId: quotation.id }, db.salesA);
  };
  const updatesOf = (orderId: number) =>
    db.dataSource.query<UpdateRow[]>(
      `SELECT role_codes, user_ids, exclude_user_ids, required_scope, link, payload
         FROM notifications
        WHERE event_type = 'sales.order.updated' AND (payload->>'orderId')::int = $1`,
      [orderId],
    );
  const broadcastOf = (rows: UpdateRow[]) =>
    rows.find((row) => row.user_ids.length === 0);
  const ownerRecordOf = (rows: UpdateRow[]) =>
    rows.find((row) => row.user_ids.length > 0);
  const statusOf = async (orderId: number) =>
    (
      await db.dataSource.query<Array<{ status: string }>>(
        `SELECT status FROM sales_orders WHERE id = $1`,
        [orderId],
      )
    )[0].status;

  it('tells the follower roles of an edit by the sales owner, and no owner record', async () => {
    const order = await openOrder();

    await edit.update(order.id, { deliveryDate: '2027-03-01' }, db.salesA);

    const rows = await updatesOf(order.id);
    expect(rows).toHaveLength(1);
    expect([...rows[0].role_codes].sort()).toEqual([
      'productionManager',
      'purchasing',
      'salesManager',
      'storekeeper',
    ]);
    expect(rows[0].user_ids).toEqual([]);
    expect(rows[0].exclude_user_ids).toEqual([db.salesA.userId]);
    expect(rows[0]).toMatchObject({
      required_scope: 'material:read',
      link: `/inventory/materials/${order.id}`,
    });
    expect(rows[0].payload).toMatchObject({
      orderId: order.id,
      code: order.code,
      change: 'edited',
    });
  });

  it('also tells the sales owner of an edit by somebody else, the editor excluded from both', async () => {
    const order = await openOrder();

    await edit.update(order.id, { contractNo: 'HD-9' }, db.manager);

    const rows = await updatesOf(order.id);
    expect(rows).toHaveLength(2);
    expect([...(broadcastOf(rows)?.exclude_user_ids ?? [])].sort()).toEqual(
      [db.manager.userId, db.salesA.userId].sort(),
    );
    expect(ownerRecordOf(rows)).toMatchObject({
      role_codes: [],
      user_ids: [db.salesA.userId],
      required_scope: 'order:read',
      link: `/sales/orders/${order.id}`,
    });
    expect(ownerRecordOf(rows)?.payload).toMatchObject({ change: 'edited' });
  });

  it('tells nobody of a save that changes nothing', async () => {
    const order = await openOrder();
    await edit.update(order.id, { contractNo: 'HD-1' }, db.manager);
    expect(await updatesOf(order.id)).toHaveLength(2);

    await edit.update(order.id, { contractNo: ' HD-1 ' }, db.manager);
    await edit.update(order.id, {}, db.manager);

    expect(await updatesOf(order.id)).toHaveLength(2);
  });

  it('tells the followers of a cancel with its reason', async () => {
    const order = await openOrder();

    await edit.cancel(order.id, { reason: ' Customer left ' }, db.manager);

    const rows = await updatesOf(order.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.payload).toMatchObject({
        orderId: order.id,
        change: 'cancelled',
        reason: 'Customer left',
      });
    }
    expect(ownerRecordOf(rows)?.user_ids).toEqual([db.salesA.userId]);
  });

  it('leaves no notice and keeps the order open when the cancel rolls back', async () => {
    const order = await openOrder();
    failHook = true;

    await expect(
      edit.cancel(order.id, { reason: 'Customer left' }, db.manager),
    ).rejects.toThrow('Stock hook failed.');

    expect(await statusOf(order.id)).toBe('open');
    expect(await updatesOf(order.id)).toEqual([]);
  });
});
