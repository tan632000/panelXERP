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
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { CustomerService } from '@plugins/crm/customer/services/customer.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { CreateCustomerDto } from '@plugins/crm/customer/dto/create-customer.dto';
import type { Customer } from '@plugins/crm/customer/entities/customer.entity';

const SALES_A: AuthUserPayload = { userId: 11, role: 'sales' };
const SALES_B: AuthUserPayload = { userId: 12, role: 'sales' };
const MANAGER: AuthUserPayload = { userId: 20, role: 'salesManager' };
const ENGINEER: AuthUserPayload = { userId: 30, role: 'engineer' };

type CustomerRow = Customer & FakeRow;

function buildService(options: { eligibleOwner?: boolean } = {}) {
  const customers = new FakeRepo<CustomerRow>({
    unique: [
      {
        constraint: 'uq_customers_code_active',
        collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
      },
    ],
  });
  const ownerQuery = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(options.eligibleOwner ?? true),
    getMany: jest.fn().mockResolvedValue([{ id: 11, fullName: 'Sales A' }]),
  };
  const users = {
    find: jest.fn().mockResolvedValue([
      { id: 11, fullName: 'Sales A' },
      { id: 12, fullName: 'Sales B' },
    ]),
    findOne: jest.fn().mockResolvedValue({ id: 11, fullName: 'Sales A' }),
    createQueryBuilder: jest.fn().mockReturnValue(ownerQuery),
  };
  const registry = new ReferenceCheckRegistry();
  const service = new CustomerService(
    customers as never,
    users as never,
    new DataScopeService(),
    registry,
  );
  return { service, customers, users, ownerQuery, registry };
}

function dto(overrides: Partial<CreateCustomerDto> = {}): CreateCustomerDto {
  return { code: 'KH_0001', name: 'Alpha Panels', ...overrides };
}

describe('CustomerService', () => {
  describe('code uniqueness', () => {
    it('answers 409 when an active customer already has the code', async () => {
      const { service } = buildService();
      await service.create(dto(), SALES_A);

      await expect(
        service.create(dto({ code: 'kh_0001', name: 'Beta' }), SALES_B),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 409 when a concurrent create wins the unique index', async () => {
      const { service, customers } = buildService();
      // The pre-check sees nothing; the index then refuses the insert.
      customers.rows.push({
        id: 99,
        code: 'KH_0001',
        name: 'Raced',
        salesOwnerId: 12,
        isDeleted: false,
      } as CustomerRow);
      customers.findOne.mockResolvedValueOnce(null);

      await expect(service.create(dto(), SALES_A)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lets a soft-deleted customer’s code be used again', async () => {
      const { service, customers } = buildService();
      const first = await service.create(dto(), SALES_A);
      await service.remove(first.id, SALES_A);
      expect(customers.rows[0].isDeleted).toBe(true);

      const reused = await service.create(
        dto({ name: 'Alpha again' }),
        SALES_A,
      );

      expect(reused.code).toBe('KH_0001');
      expect(reused.id).not.toBe(first.id);
    });
  });

  describe('owner scope', () => {
    it('hides another sales account’s customer: read, update and delete answer 404', async () => {
      const { service } = buildService();
      const mine = await service.create(dto(), SALES_A);

      await expect(service.findOne(mine.id, SALES_B)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(mine.id, { name: 'Stolen' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(mine.id, SALES_B)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(mine.id, SALES_A)).resolves.toMatchObject({
        id: mine.id,
      });
    });

    it('lists only the caller’s customers for Sales and every customer for a manager', async () => {
      const { service } = buildService();
      await service.create(dto({ code: 'KH_0001' }), SALES_A);
      await service.create(dto({ code: 'KH_0002', name: 'Beta' }), SALES_B);

      const forA = await service.findAll({}, SALES_A);
      const forManager = await service.findAll({}, MANAGER);
      const forEngineer = await service.findAll({}, ENGINEER);

      expect(forA.data.map((row) => row.code)).toEqual(['KH_0001']);
      expect(forManager.data.map((row) => row.code)).toEqual([
        'KH_0001',
        'KH_0002',
      ]);
      expect(forEngineer.data).toEqual([]);
    });
  });

  describe('sales owner', () => {
    it('defaults the owner to the caller', async () => {
      const { service } = buildService();
      const created = await service.create(dto(), SALES_A);
      expect(created.salesOwnerId).toBe(SALES_A.userId);
    });

    it('refuses a Sales actor who names another owner, on create and update', async () => {
      const { service } = buildService();

      await expect(
        service.create(dto({ salesOwnerId: SALES_B.userId }), SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);

      const mine = await service.create(dto(), SALES_A);
      await expect(
        service.update(mine.id, { salesOwnerId: SALES_B.userId }, SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets a manager assign and reassign to an eligible sales account', async () => {
      const { service } = buildService();
      const created = await service.create(
        dto({ salesOwnerId: SALES_A.userId }),
        MANAGER,
      );
      expect(created.salesOwnerId).toBe(SALES_A.userId);

      const moved = await service.update(
        created.id,
        { salesOwnerId: SALES_B.userId },
        MANAGER,
      );
      expect(moved.salesOwnerId).toBe(SALES_B.userId);
      // Ownership moved, so the previous owner no longer reaches the customer.
      await expect(service.findOne(created.id, SALES_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an owner who is not an active sales account', async () => {
      const { service } = buildService({ eligibleOwner: false });
      await expect(
        service.create(dto({ salesOwnerId: 999 }), MANAGER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('offers a Sales actor only themselves as owner', async () => {
      const { service, ownerQuery } = buildService();
      await expect(service.listOwnerOptions(SALES_A)).resolves.toEqual([
        { id: 11, fullName: 'Sales A' },
      ]);
      expect(ownerQuery.getMany).not.toHaveBeenCalled();

      await service.listOwnerOptions(MANAGER);
      expect(ownerQuery.getMany).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('answers 409 and keeps the row when a registered check reports a reference', async () => {
      const { service, customers, registry } = buildService();
      const created = await service.create(dto(), SALES_A);
      registry.registerCustomerCheck('project', (id) =>
        Promise.resolve(id === created.id),
      );

      await expect(service.remove(created.id, SALES_A)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(customers.rows[0].isDeleted).toBe(false);
    });

    it('reports the referenced row as failed in a bulk delete and deletes the rest', async () => {
      const { service, customers, registry } = buildService();
      const used = await service.create(dto({ code: 'KH_0001' }), SALES_A);
      const free = await service.create(
        dto({ code: 'KH_0002', name: 'Beta' }),
        SALES_A,
      );
      registry.registerCustomerCheck('quotation', (id) =>
        Promise.resolve(id === used.id),
      );

      const result = await service.removeMany([used.id, free.id], SALES_A);

      expect(result.deleted).toEqual([free.id]);
      expect(result.failed).toEqual([
        {
          id: used.id,
          message: expect.stringContaining('referenced') as string,
        },
      ]);
      expect(customers.rows.find((row) => row.id === used.id)?.isDeleted).toBe(
        false,
      );
    });

    it('asks every registered check, and deletes when none reports a reference', async () => {
      const { service, registry } = buildService();
      const created = await service.create(dto(), SALES_A);
      const first = jest.fn().mockResolvedValue(false);
      const second = jest.fn().mockResolvedValue(false);
      registry.registerCustomerCheck('project', first);
      registry.registerCustomerCheck('order', second);

      await expect(service.remove(created.id, SALES_A)).resolves.toEqual({
        id: created.id,
      });
      expect(first).toHaveBeenCalledWith(created.id);
      expect(second).toHaveBeenCalledWith(created.id);
    });
  });

  describe('update', () => {
    it('clears optional fields sent as null and rejects a null or blank name with 400', async () => {
      const { service } = buildService();
      const created = await service.create(
        dto({ taxCode: '0101234567', address: 'Somewhere' }),
        SALES_A,
      );

      const cleared = await service.update(
        created.id,
        { taxCode: null, address: null } as never,
        SALES_A,
      );
      expect(cleared.taxCode).toBeNull();
      expect(cleared.address).toBeNull();

      for (const name of [null, '', '   ']) {
        await expect(
          service.update(created.id, { name } as never, SALES_A),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        service.create(dto({ code: 'KH_0002', name: '   ' }), SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps the code immutable and clears an emptied optional field', async () => {
      const { service } = buildService();
      const created = await service.create(
        dto({ taxCode: '0101234567' }),
        SALES_A,
      );

      await expect(
        service.update(created.id, { code: 'KH_0009' }, SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);

      const updated = await service.update(
        created.id,
        { taxCode: ' ' },
        SALES_A,
      );
      expect(updated.taxCode).toBeNull();
    });
  });
});
