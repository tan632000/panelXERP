import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { ContactService } from '@plugins/crm/contact/services/contact.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Contact } from '@plugins/crm/contact/entities/contact.entity';
import type { Customer } from '@plugins/crm/customer/entities/customer.entity';

const SALES_A: AuthUserPayload = { userId: 11, role: 'sales' };
const SALES_B: AuthUserPayload = { userId: 12, role: 'sales' };
const MANAGER: AuthUserPayload = { userId: 20, role: 'salesManager' };

type CustomerRow = Customer & FakeRow;
type ContactRow = Contact & FakeRow;

function buildService() {
  const customers = new FakeRepo<CustomerRow>();
  const contacts = new FakeRepo<ContactRow>({
    // A row's customer is read through its current row, so ownership changes show at once.
    join: (row) => {
      const customer = customers.rows.find(
        (candidate) => candidate.id === row.customerId && !candidate.deletedAt,
      );
      return customer ? { customer } : { customer: undefined };
    },
    unique: [
      {
        constraint: 'uq_contacts_primary_per_customer',
        collides: (a, b) =>
          a.isPrimary && b.isPrimary && a.customerId === b.customerId,
      },
    ],
  });
  // The service demotes through the transaction's manager; the fake repo plays that part.
  Object.assign(contacts, {
    manager: {
      transaction: <T>(work: (manager: unknown) => Promise<T>) =>
        work({ update: contacts.update, save: contacts.save }),
    },
  });

  const service = new ContactService(
    contacts as never,
    customers as never,
    new DataScopeService(),
  );

  const customerOf = (salesOwnerId: number, code: string) =>
    customers.seed({
      code,
      name: code,
      salesOwnerId,
    } as Omit<CustomerRow, 'id' | 'isDeleted'>);

  return { service, contacts, customers, customerOf };
}

describe('ContactService', () => {
  describe('primary contact', () => {
    it('demotes the previous primary when another contact becomes primary', async () => {
      const { service, contacts, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');

      const first = await service.create(
        { customerId: customer.id, name: 'First', isPrimary: true },
        SALES_A,
      );
      const second = await service.create(
        { customerId: customer.id, name: 'Second', isPrimary: true },
        SALES_A,
      );

      const primaries = contacts.rows.filter((row) => row.isPrimary);
      expect(primaries.map((row) => row.id)).toEqual([second.id]);
      expect(contacts.rows.find((row) => row.id === first.id)?.isPrimary).toBe(
        false,
      );
    });

    it('promotes an existing contact through update and leaves the other customers alone', async () => {
      const { service, contacts, customerOf } = buildService();
      const mine = customerOf(SALES_A.userId, 'KH_0001');
      const other = customerOf(SALES_A.userId, 'KH_0002');
      const otherPrimary = await service.create(
        { customerId: other.id, name: 'Elsewhere', isPrimary: true },
        SALES_A,
      );
      const primary = await service.create(
        { customerId: mine.id, name: 'Primary', isPrimary: true },
        SALES_A,
      );
      const plain = await service.create(
        { customerId: mine.id, name: 'Plain' },
        SALES_A,
      );
      expect(plain.isPrimary).toBe(false);

      await service.update(plain.id, { isPrimary: true }, SALES_A);

      const state = Object.fromEntries(
        contacts.rows.map((row) => [row.id, row.isPrimary]),
      );
      expect(state).toEqual({
        [otherPrimary.id]: true,
        [primary.id]: false,
        [plain.id]: true,
      });
    });

    it('reports 409 when a concurrent request wins the one-primary index', async () => {
      const { service, contacts, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      // The index refuses the insert even though the demotion found nothing to demote.
      contacts.update.mockResolvedValueOnce(undefined);
      contacts.rows.push({
        id: 500,
        customerId: customer.id,
        name: 'Raced',
        isPrimary: true,
        isDeleted: false,
      } as ContactRow);

      await expect(
        service.create(
          { customerId: customer.id, name: 'Late', isPrimary: true },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('visibility follows the customer owner', () => {
    it('hides the contacts of another sales account’s customer', async () => {
      const { service, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const contact = await service.create(
        { customerId: customer.id, name: 'Buyer' },
        SALES_A,
      );

      await expect(service.findOne(contact.id, SALES_B)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(contact.id, { name: 'Changed' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(contact.id, SALES_B)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(contact.id, SALES_A)).resolves.toMatchObject(
        {
          id: contact.id,
        },
      );
      await expect(service.findOne(contact.id, MANAGER)).resolves.toMatchObject(
        {
          id: contact.id,
        },
      );
    });

    it('refuses to add a contact to a customer the actor cannot see, with 404', async () => {
      const { service, customerOf, contacts } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');

      await expect(
        service.create({ customerId: customer.id, name: 'Intruder' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(contacts.rows).toHaveLength(0);
    });

    it('lists only the contacts of the actor’s customers', async () => {
      const { service, customerOf } = buildService();
      const a = customerOf(SALES_A.userId, 'KH_0001');
      const b = customerOf(SALES_B.userId, 'KH_0002');
      await service.create({ customerId: a.id, name: 'For A' }, SALES_A);
      await service.create({ customerId: b.id, name: 'For B' }, SALES_B);

      const forA = await service.findAll({}, SALES_A);
      const forManager = await service.findAll({}, MANAGER);
      const filtered = await service.findAll({ customerId: b.id }, SALES_A);

      expect(forA.data.map((row) => row.name)).toEqual(['For A']);
      expect(forManager.data.map((row) => row.name).sort()).toEqual([
        'For A',
        'For B',
      ]);
      expect(filtered.data).toEqual([]);
    });

    it('moves with the customer when it is reassigned', async () => {
      const { service, customers, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const contact = await service.create(
        { customerId: customer.id, name: 'Buyer' },
        SALES_A,
      );

      const row = customers.rows.find(
        (candidate) => candidate.id === customer.id,
      );
      (row as CustomerRow).salesOwnerId = SALES_B.userId;

      await expect(service.findOne(contact.id, SALES_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(contact.id, SALES_B)).resolves.toMatchObject(
        {
          id: contact.id,
        },
      );
    });

    it('hides the contacts of a deleted customer', async () => {
      const { service, customers, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const contact = await service.create(
        { customerId: customer.id, name: 'Buyer' },
        SALES_A,
      );

      const row = customers.rows.find(
        (candidate) => candidate.id === customer.id,
      );
      (row as CustomerRow).isDeleted = true;

      await expect(service.findOne(contact.id, MANAGER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('clears optional fields sent as null and rejects a null or blank name with 400', async () => {
    const { service, customerOf } = buildService();
    const customer = customerOf(SALES_A.userId, 'KH_0001');
    const contact = await service.create(
      {
        customerId: customer.id,
        name: 'Buyer',
        phone: '0900000000',
        position: 'Buyer',
        isPrimary: true,
      },
      SALES_A,
    );

    const cleared = await service.update(
      contact.id,
      { phone: null, position: null, isPrimary: null } as never,
      SALES_A,
    );
    expect(cleared.phone).toBeNull();
    expect(cleared.position).toBeNull();
    // A null flag is ignored rather than stored.
    expect(cleared.isPrimary).toBe(true);

    for (const name of [null, '', '   ']) {
      await expect(
        service.update(contact.id, { name } as never, SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.create({ customerId: customer.id, name: '  ' }, SALES_A),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-deletes a contact so it drops out of reads', async () => {
    const { service, customerOf } = buildService();
    const customer = customerOf(SALES_A.userId, 'KH_0001');
    const contact = await service.create(
      { customerId: customer.id, name: 'Buyer' },
      SALES_A,
    );

    await service.remove(contact.id, SALES_A);

    await expect(service.findOne(contact.id, SALES_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
