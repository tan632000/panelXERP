import { randomBytes } from 'crypto';

import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry as CrmReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { EstimateReadPort } from '@plugins/sales/_shared/ports/estimate-read.port';
import { RequestCloseRegistry } from '@plugins/sales/_shared/ports/request-close-registry';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { QuotationBomLine } from '@plugins/sales/quotation/entities/quotation-bom-line.entity';
import { QuotationCostLine } from '@plugins/sales/quotation/entities/quotation-cost-line.entity';
import { QuotationFeedback } from '@plugins/sales/quotation/entities/quotation-feedback.entity';
import { QuotationLine } from '@plugins/sales/quotation/entities/quotation-line.entity';
import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { QuotationApprovalService } from '@plugins/sales/quotation/services/quotation-approval.service';
import { QuotationFeedbackService } from '@plugins/sales/quotation/services/quotation-feedback.service';
import { QuotationPdfService } from '@plugins/sales/quotation/services/quotation-pdf.service';
import { QuotationVersionService } from '@plugins/sales/quotation/services/quotation-version.service';
import { QuotationService } from '@plugins/sales/quotation/services/quotation.service';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestService } from '@plugins/sales/request/services/request.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * Wiring shared by the quotation specs that run against the real Postgres of the compose
 * stack. An unreachable database fails the suite; `SKIP_DB_SPECS=1` is the one explicit
 * opt-out, and then jest reports these as skipped. Needs the seeded demo accounts. Named
 * `*-spec.ts` so the production build leaves it out.
 */
export const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

/** An entity class, as TypeORM takes it in a data source. */
export type EntityClass = new (...args: never[]) => object;

export interface PanelSpec {
  tag: string;
  quantity: number;
  /** Cost of the panel's single BOM line, VND. */
  unitCost: number;
}

export interface QuotationDb {
  dataSource: DataSource;
  estimateService: EstimateService;
  editor: EstimateEditService;
  quotations: QuotationService;
  versions: QuotationVersionService;
  approvals: QuotationApprovalService;
  feedback: QuotationFeedbackService;
  exports: QuotationPdfService;
  /** The request service wired with the quotation's close hook, for closing a request. */
  requests: RequestService;
  /** Stands in for the notification service: every emitted notice lands here. */
  notifications: { emit: jest.Mock };
  tag: string;
  itemId: number;
  customerId: number;
  salesA: AuthUserPayload;
  salesB: AuthUserPayload;
  manager: AuthUserPayload;
  engineer: AuthUserPayload;
  lead: AuthUserPayload;
  director: AuthUserPayload;
  /** An estimated request: assigned, estimate with the panels built and submitted. */
  estimatedRequest(panels?: PanelSpec[]): Promise<{
    requestId: number;
    estimateId: number;
    revisionId: number;
  }>;
  /** A request row at `status`, tracked for cleanup, with no estimate. */
  requestAt(status: string): Promise<number>;
  /** Gives the request a contact of its customer, removed by `cleanup`. */
  addContact(
    requestId: number,
    contact: { name: string; phone: string; email: string },
  ): Promise<void>;
  cleanup(): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_PANELS: PanelSpec[] = [
  { tag: 'MSB-01', quantity: 2, unitCost: 1000 },
];

/**
 * `foreignEntities` are the CRM and catalog entities the estimate tables reference; the spec
 * passes them because only a spec may import another plugin's entities.
 */
export async function openQuotationDb(
  foreignEntities: EntityClass[],
): Promise<QuotationDb> {
  const tag = randomBytes(4).toString('hex');
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [
      SalesRequest,
      SalesRequestActivity,
      Estimate,
      EstimateRevision,
      EstimatePanel,
      EstimateBomLine,
      EstimateCostLine,
      Quotation,
      QuotationVersion,
      QuotationLine,
      QuotationBomLine,
      QuotationCostLine,
      QuotationFeedback,
      ...foreignEntities,
    ],
  });
  try {
    await dataSource.initialize();
  } catch (error: unknown) {
    throw new Error(
      `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
    );
  }

  const accounts: Array<{ id: number; username: string }> =
    await dataSource.query(
      `SELECT id, username FROM users
       WHERE username IN ('sales_a', 'sales_b', 'sales_mgr', 'engineer_a', 'eng_lead', 'director')`,
    );
  const idOf = (username: string): number => {
    const account = accounts.find((entry) => entry.username === username);
    if (!account) {
      throw new Error(
        `The seeded ${username} account is missing: run \`npm run seed\`.`,
      );
    }
    return account.id;
  };
  const salesAId = idOf('sales_a');
  const engineerId = idOf('engineer_a');

  const dataScope = new DataScopeService();
  const statusPort = new RequestStatusPort();
  const notifications = { emit: jest.fn().mockResolvedValue(1) };
  const users = {
    namesOf: () => Promise.resolve(new Map<number, string>()),
    contactOf: () =>
      Promise.resolve({
        fullName: 'Sales A',
        phone: '0900000001',
        email: 'sales.a@example.test',
      }),
  };
  const crm = {
    getCustomerSummary: (id: number) =>
      Promise.resolve({ id, code: 'KH', name: 'Customer' }),
    getCustomerSummaries: () => Promise.resolve(new Map()),
    getContactSummary: async (id: number) => {
      const [row]: Array<{ id: number; name: string }> = await dataSource.query(
        `SELECT id, name, phone, email FROM contacts WHERE id = $1`,
        [id],
      );
      return row ?? null;
    },
  };
  const estimateService = new EstimateService(
    dataSource.getRepository(Estimate),
    dataSource.getRepository(EstimateRevision),
    dataSource.getRepository(SalesRequest),
    dataSource,
    dataScope,
    statusPort,
    users as never,
    crm as never,
    notifications as never,
    new ReferenceCheckRegistry(),
  );
  const editor = new EstimateEditService(dataSource, estimateService);
  const quotations = new QuotationService(
    dataSource.getRepository(Quotation),
    dataSource.getRepository(QuotationVersion),
    dataSource.getRepository(SalesRequest),
    dataSource,
    dataScope,
    new EstimateReadPort(),
    users as never,
    crm as never,
  );
  const estimateRead = new EstimateReadPort();
  const versions = new QuotationVersionService(
    dataSource,
    dataScope,
    quotations,
    estimateRead,
  );
  const closeHooks = new RequestCloseRegistry();
  const approvals = new QuotationApprovalService(
    dataSource,
    dataScope,
    quotations,
    estimateRead,
    statusPort,
    notifications as never,
    closeHooks,
  );
  approvals.onModuleInit();
  const feedback = new QuotationFeedbackService(
    dataSource,
    dataScope,
    users as never,
  );
  const exports = new QuotationPdfService(
    dataSource,
    dataScope,
    crm as never,
    users as never,
  );
  const requests = new RequestService(
    dataSource.getRepository(SalesRequest),
    dataSource.getRepository(SalesRequestActivity),
    dataSource,
    dataScope,
    crm as never,
    users as never,
    notifications as never,
    statusPort,
    new CrmReferenceCheckRegistry(),
    new CustomerOwnerChangeRegistry(),
    closeHooks,
  );

  const [customer]: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO customers (code, name, sales_owner_id) VALUES ($1, 'QT spec customer', $2) RETURNING id`,
    [`KH_QT${tag}`, salesAId],
  );
  const [item]: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO items (code, name, item_group, unit, reference_price)
     VALUES ($1, 'QT spec item', 'other', 'Cái', 1000) RETURNING id`,
    [`QT-${tag}`],
  );

  const requestIds: number[] = [];
  const contactIds: number[] = [];
  const engineer: AuthUserPayload = { userId: engineerId, role: 'engineer' };

  const requestAt = async (status: string): Promise<number> => {
    const [row]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO sales_requests (code, customer_id, title, sales_owner_id, assigned_engineer_id, status)
       VALUES ($1, $2, 'QT spec request', $3, $4, $5) RETURNING id`,
      [
        `YC_QT${randomBytes(5).toString('hex')}`,
        customer.id,
        salesAId,
        engineerId,
        status,
      ],
    );
    requestIds.push(row.id);
    return row.id;
  };

  return {
    dataSource,
    estimateService,
    editor,
    quotations,
    versions,
    approvals,
    feedback,
    exports,
    requests,
    notifications,
    tag,
    itemId: item.id,
    customerId: customer.id,
    salesA: { userId: salesAId, role: 'sales' },
    salesB: { userId: idOf('sales_b'), role: 'sales' },
    manager: { userId: idOf('sales_mgr'), role: 'salesManager' },
    engineer,
    lead: { userId: idOf('eng_lead'), role: 'engineeringLead' },
    director: { userId: idOf('director'), role: 'director' },
    requestAt,
    async addContact(requestId, contact) {
      const [row]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO contacts (customer_id, name, phone, email)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [customer.id, contact.name, contact.phone, contact.email],
      );
      contactIds.push(row.id);
      await dataSource.query(
        `UPDATE sales_requests SET contact_id = $2 WHERE id = $1`,
        [requestId, row.id],
      );
    },
    async estimatedRequest(panels = DEFAULT_PANELS) {
      const requestId = await requestAt('assigned');
      const estimate = await estimateService.create({ requestId }, engineer);
      for (const panel of panels) {
        const view = await editor.addPanel(
          estimate.id,
          { tag: panel.tag, quantity: panel.quantity },
          engineer,
        );
        await editor.addBomLine(
          estimate.id,
          view.panels[view.panels.length - 1].id,
          { itemId: item.id, quantity: 1, unitCost: panel.unitCost },
          engineer,
        );
      }
      const submitted = await estimateService.submit(estimate.id, engineer);
      return {
        requestId,
        estimateId: estimate.id,
        revisionId: submitted.current.id,
      };
    },
    async cleanup() {
      if (requestIds.length === 0) return;
      await dataSource.query(
        `DELETE FROM sales_quotations WHERE request_id = ANY($1)`,
        [requestIds],
      );
      await dataSource.query(
        `DELETE FROM sales_estimates WHERE request_id = ANY($1)`,
        [requestIds],
      );
      await dataSource.query(
        `DELETE FROM sales_request_activities WHERE request_id = ANY($1)`,
        [requestIds],
      );
      await dataSource.query(`DELETE FROM sales_requests WHERE id = ANY($1)`, [
        requestIds,
      ]);
      requestIds.length = 0;
      if (contactIds.length > 0) {
        await dataSource.query(`DELETE FROM contacts WHERE id = ANY($1)`, [
          contactIds,
        ]);
        contactIds.length = 0;
      }
    },
    async close() {
      if (!dataSource.isInitialized) return;
      await dataSource.query(`DELETE FROM items WHERE id = $1`, [item.id]);
      await dataSource.query(`DELETE FROM customers WHERE id = $1`, [
        customer.id,
      ]);
      await dataSource.destroy();
    },
  };
}
