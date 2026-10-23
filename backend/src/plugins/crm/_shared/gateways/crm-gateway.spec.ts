import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';

import type { Customer } from '@plugins/crm/customer/entities/customer.entity';

type CustomerRow = Customer & FakeRow;

describe('CrmGateway', () => {
  function build() {
    const customers = new FakeRepo<CustomerRow>();
    return { customers, gateway: new CrmGateway(customers as never) };
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
});
