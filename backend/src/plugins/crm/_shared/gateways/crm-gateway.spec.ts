import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';

import type { Contact } from '@plugins/crm/contact/entities/contact.entity';
import type { Customer } from '@plugins/crm/customer/entities/customer.entity';
import type { Project } from '@plugins/crm/project/entities/project.entity';

type CustomerRow = Customer & FakeRow;
type ProjectRow = Project & FakeRow;
type ContactRow = Contact & FakeRow;

describe('CrmGateway', () => {
  function build() {
    const customers = new FakeRepo<CustomerRow>();
    const projects = new FakeRepo<ProjectRow>();
    const contacts = new FakeRepo<ContactRow>();
    return {
      customers,
      projects,
      contacts,
      gateway: new CrmGateway(
        customers as never,
        projects as never,
        contacts as never,
      ),
    };
  }

  it('summarises a live customer', async () => {
    const { customers, gateway } = build();
    const row = customers.seed({
      code: 'KH_0001',
      name: 'Alpha Panels',
      taxCode: '0101234567',
      address: '1 Demo Street',
      phone: '0900000000',
      salesOwnerId: 11,
    } as Omit<CustomerRow, 'id' | 'isDeleted'>);

    await expect(gateway.getCustomerSummary(row.id)).resolves.toEqual({
      id: row.id,
      code: 'KH_0001',
      name: 'Alpha Panels',
      taxCode: '0101234567',
      address: '1 Demo Street',
      salesOwnerId: 11,
      isDeleted: false,
    });
  });

  it('still resolves a soft-deleted customer, flagged as deleted', async () => {
    const { customers, gateway } = build();
    const row = customers.seed({
      code: 'KH_0001',
      name: 'Alpha Panels',
      salesOwnerId: 11,
      isDeleted: true,
      deletedAt: new Date(),
    } as Omit<CustomerRow, 'id'>);

    const summary = await gateway.getCustomerSummary(row.id);

    expect(summary).toMatchObject({
      id: row.id,
      name: 'Alpha Panels',
      taxCode: null,
      address: null,
      isDeleted: true,
    });
    expect(customers.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
  });

  it('answers null for an id that never existed', async () => {
    const { gateway } = build();
    await expect(gateway.getCustomerSummary(404)).resolves.toBeNull();
  });

  it('summarises a live project', async () => {
    const { projects, gateway } = build();
    const row = projects.seed({
      code: 'DA_0001',
      customerId: 5,
      name: 'Tower A',
      siteAddress: '1 Site Road',
      note: 'Phase 1',
    } as Omit<ProjectRow, 'id' | 'isDeleted'>);

    await expect(gateway.getProjectSummary(row.id)).resolves.toEqual({
      id: row.id,
      code: 'DA_0001',
      name: 'Tower A',
      siteAddress: '1 Site Road',
      customerId: 5,
      isDeleted: false,
    });
  });

  it('still resolves a soft-deleted project, flagged as deleted', async () => {
    const { projects, gateway } = build();
    const row = projects.seed({
      code: 'DA_0001',
      customerId: 5,
      name: 'Tower A',
      isDeleted: true,
      deletedAt: new Date(),
    } as Omit<ProjectRow, 'id'>);

    const summary = await gateway.getProjectSummary(row.id);

    expect(summary).toMatchObject({
      id: row.id,
      name: 'Tower A',
      siteAddress: null,
      isDeleted: true,
    });
    expect(projects.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
  });

  it('answers null for a project id that never existed', async () => {
    const { gateway } = build();
    await expect(gateway.getProjectSummary(404)).resolves.toBeNull();
  });

  it('summarises many customers in one read, deleted ones included', async () => {
    const { customers, gateway } = build();
    const live = customers.seed({
      code: 'KH_0001',
      name: 'Alpha',
      salesOwnerId: 11,
    } as Omit<CustomerRow, 'id' | 'isDeleted'>);
    const deleted = customers.seed({
      code: 'KH_0002',
      name: 'Beta',
      salesOwnerId: 11,
      isDeleted: true,
      deletedAt: new Date(),
    } as Omit<CustomerRow, 'id'>);

    const summaries = await gateway.getCustomerSummaries([
      live.id,
      deleted.id,
      live.id,
      999,
    ]);

    expect([...summaries.keys()].sort()).toEqual([live.id, deleted.id].sort());
    expect(summaries.get(deleted.id)?.isDeleted).toBe(true);
    expect(customers.find).toHaveBeenCalledTimes(1);
    await expect(gateway.getCustomerSummaries([])).resolves.toEqual(new Map());
  });

  it('summarises a contact, soft-deleted rows included', async () => {
    const { contacts, gateway } = build();
    const live = contacts.seed({
      customerId: 5,
      name: 'Nguyen An',
      position: 'Buyer',
      phone: '0900000001',
      email: 'an@example.com',
      isPrimary: true,
    } as Omit<ContactRow, 'id' | 'isDeleted'>);
    const deleted = contacts.seed({
      customerId: 5,
      name: 'Tran Binh',
      isPrimary: false,
      isDeleted: true,
      deletedAt: new Date(),
    } as Omit<ContactRow, 'id'>);

    await expect(gateway.getContactSummary(live.id)).resolves.toEqual({
      id: live.id,
      customerId: 5,
      name: 'Nguyen An',
      position: 'Buyer',
      phone: '0900000001',
      email: 'an@example.com',
      isDeleted: false,
    });
    await expect(gateway.getContactSummary(deleted.id)).resolves.toMatchObject({
      name: 'Tran Binh',
      position: null,
      isDeleted: true,
    });
    await expect(gateway.getContactSummary(404)).resolves.toBeNull();
  });

  it('reads the owner under a shared lock inside the caller transaction', async () => {
    const { gateway } = build();
    const query = jest.fn().mockResolvedValue([{ sales_owner_id: 12 }]);
    const manager = { query } as never;

    await expect(gateway.lockCustomerOwner(manager, 5)).resolves.toBe(12);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FOR SHARE');
    expect(sql).toContain('is_deleted = false');
    expect(params).toEqual([5]);
  });

  it('answers null for an unknown or deleted customer', async () => {
    const { gateway } = build();
    const manager = { query: jest.fn().mockResolvedValue([]) } as never;

    await expect(gateway.lockCustomerOwner(manager, 5)).resolves.toBeNull();
  });
});
