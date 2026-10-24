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
import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { CustomerService } from '@plugins/crm/customer/services/customer.service';
import { ProjectService } from '@plugins/crm/project/services/project.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Customer } from '@plugins/crm/customer/entities/customer.entity';
import type { CreateProjectDto } from '@plugins/crm/project/dto/create-project.dto';
import type { Project } from '@plugins/crm/project/entities/project.entity';

const SALES_A: AuthUserPayload = { userId: 11, role: 'sales' };
const SALES_B: AuthUserPayload = { userId: 12, role: 'sales' };
const MANAGER: AuthUserPayload = { userId: 20, role: 'salesManager' };
const ENGINEER: AuthUserPayload = { userId: 30, role: 'engineer' };

type CustomerRow = Customer & FakeRow;
type ProjectRow = Project & FakeRow;

function buildService() {
  const customers = new FakeRepo<CustomerRow>({
    unique: [
      {
        constraint: 'uq_customers_code_active',
        collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
      },
    ],
  });
  const projects = new FakeRepo<ProjectRow>({
    // A row's customer is read through its current row, so owner and delete changes show at once.
    join: (row) => {
      const customer = customers.rows.find(
        (candidate) => candidate.id === row.customerId && !candidate.deletedAt,
      );
      return customer ? { customer } : { customer: undefined };
    },
    unique: [
      {
        constraint: 'uq_projects_code_active',
        collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
      },
    ],
  });
  const registry = new ReferenceCheckRegistry();
  const service = new ProjectService(
    projects as never,
    customers as never,
    new DataScopeService(),
    registry,
  );
  const customerService = new CustomerService(
    customers as never,
    {} as never,
    new DataScopeService(),
    registry,
    new CustomerOwnerChangeRegistry(),
  );

  const customerOf = (
    salesOwnerId: number,
    code: string,
    extra: Partial<CustomerRow> = {},
  ) =>
    customers.seed({
      code,
      name: code,
      salesOwnerId,
      ...extra,
    } as Omit<CustomerRow, 'id' | 'isDeleted'>);

  return {
    service,
    customerService,
    projects,
    customers,
    registry,
    customerOf,
  };
}

function dto(
  customerId: number,
  overrides: Partial<CreateProjectDto> = {},
): CreateProjectDto {
  return { code: 'DA_0001', customerId, name: 'Tower A', ...overrides };
}

describe('ProjectService', () => {
  describe('code uniqueness', () => {
    it('answers 409 when an active project already has the code', async () => {
      const { service, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      await service.create(dto(customer.id), SALES_A);

      await expect(
        service.create(dto(customer.id, { code: 'da_0001' }), SALES_A),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 409 when a concurrent create wins the unique index', async () => {
      const { service, projects, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      projects.rows.push({
        id: 99,
        code: 'DA_0001',
        customerId: customer.id,
        name: 'Raced',
        isDeleted: false,
      } as ProjectRow);
      // The pre-check sees nothing; the index then refuses the insert.
      projects.findOne.mockResolvedValueOnce(null);

      await expect(
        service.create(dto(customer.id), SALES_A),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets a soft-deleted project’s code be used again', async () => {
      const { service, projects, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const first = await service.create(dto(customer.id), SALES_A);
      await service.remove(first.id, SALES_A);
      expect(projects.rows[0].isDeleted).toBe(true);

      const reused = await service.create(
        dto(customer.id, { name: 'Tower again' }),
        SALES_A,
      );

      expect(reused.code).toBe('DA_0001');
      expect(reused.id).not.toBe(first.id);
    });
  });

  describe('visibility follows the customer owner', () => {
    it('hides another sales account’s project: read, update and delete answer 404', async () => {
      const { service, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const mine = await service.create(dto(customer.id), SALES_A);

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
        customerCode: 'KH_0001',
      });
      await expect(service.findOne(mine.id, MANAGER)).resolves.toMatchObject({
        id: mine.id,
      });
    });

    it('answers 404 to a create under a customer outside the actor’s scope', async () => {
      const { service, projects, customerOf } = buildService();
      const foreign = customerOf(SALES_A.userId, 'KH_0001');

      await expect(
        service.create(dto(foreign.id), SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.create(dto(404), SALES_B)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(projects.rows).toHaveLength(0);
    });

    it('lists only the projects of the caller’s customers and every project for a manager', async () => {
      const { service, customerOf } = buildService();
      const a = customerOf(SALES_A.userId, 'KH_0001');
      const b = customerOf(SALES_B.userId, 'KH_0002');
      await service.create(dto(a.id, { code: 'DA_0001' }), SALES_A);
      await service.create(dto(b.id, { code: 'DA_0002' }), SALES_B);

      const forA = await service.findAll({}, SALES_A);
      const forManager = await service.findAll({}, MANAGER);
      const forEngineer = await service.findAll({}, ENGINEER);

      expect(forA.data.map((row) => row.code)).toEqual(['DA_0001']);
      expect(forManager.data.map((row) => row.code)).toEqual([
        'DA_0001',
        'DA_0002',
      ]);
      expect(forEngineer.data).toEqual([]);
    });

    it('narrows the list to one customer when asked', async () => {
      const { service, customerOf } = buildService();
      const first = customerOf(SALES_A.userId, 'KH_0001');
      const second = customerOf(SALES_A.userId, 'KH_0002');
      await service.create(dto(first.id, { code: 'DA_0001' }), SALES_A);
      await service.create(dto(second.id, { code: 'DA_0002' }), SALES_A);

      const listed = await service.findAll({ customerId: second.id }, SALES_A);

      expect(listed.data.map((row) => row.code)).toEqual(['DA_0002']);
    });

    it('hides the projects of a soft-deleted customer', async () => {
      const { service, projects, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const project = await service.create(dto(customer.id), SALES_A);
      // `seed` hands back the stored row, so this is the customer leaving the live set.
      customer.isDeleted = true;

      await expect(service.findOne(project.id, MANAGER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const listed = await service.findAll({}, MANAGER);
      expect(listed.data).toEqual([]);
      expect(projects.rows).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('leaves the customer alone: customerId is not part of the update', async () => {
      const { service, projects, customerOf } = buildService();
      const first = customerOf(SALES_A.userId, 'KH_0001');
      const second = customerOf(SALES_A.userId, 'KH_0002');
      const created = await service.create(dto(first.id), SALES_A);

      await service.update(
        created.id,
        { name: 'Renamed', customerId: second.id } as never,
        SALES_A,
      );

      expect(projects.rows[0]).toMatchObject({
        name: 'Renamed',
        customerId: first.id,
      });
    });

    it('clears optional fields sent as null and rejects a null or blank name with 400', async () => {
      const { service, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const created = await service.create(
        dto(customer.id, { siteAddress: '1 Site Road', note: 'Phase 1' }),
        SALES_A,
      );

      const cleared = await service.update(
        created.id,
        { siteAddress: null, note: null } as never,
        SALES_A,
      );
      expect(cleared.siteAddress).toBeNull();
      expect(cleared.note).toBeNull();

      for (const name of [null, '', '   ']) {
        await expect(
          service.update(created.id, { name } as never, SALES_A),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        service.create(
          dto(customer.id, { code: 'DA_0002', name: '   ' }),
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps the code immutable and clears a blank optional field', async () => {
      const { service, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const created = await service.create(
        dto(customer.id, { siteAddress: '1 Site Road' }),
        SALES_A,
      );

      await expect(
        service.update(created.id, { code: 'DA_0009' }, SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);

      const updated = await service.update(
        created.id,
        { siteAddress: ' ' },
        SALES_A,
      );
      expect(updated.siteAddress).toBeNull();
    });
  });

  describe('customer delete', () => {
    it('answers 409 while the customer has an active project, once the project registers its check', async () => {
      const { service, customerService, customers, customerOf } =
        buildService();
      service.onModuleInit();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      await service.create(dto(customer.id), SALES_A);

      await expect(
        customerService.remove(customer.id, MANAGER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(customers.rows[0].isDeleted).toBe(false);

      const bulk = await customerService.removeMany([customer.id], MANAGER);
      expect(bulk.deleted).toEqual([]);
      expect(bulk.failed).toEqual([
        {
          id: customer.id,
          message: expect.stringContaining('referenced') as string,
        },
      ]);
    });

    it('allows the delete when the customer has only soft-deleted projects', async () => {
      const { service, customerService, customers, customerOf } =
        buildService();
      service.onModuleInit();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const project = await service.create(dto(customer.id), SALES_A);
      await service.remove(project.id, SALES_A);

      await expect(
        customerService.remove(customer.id, MANAGER),
      ).resolves.toEqual({ id: customer.id });
      expect(customers.rows[0].isDeleted).toBe(true);
    });

    it('is the registered check that blocks it: without it the same delete goes through', async () => {
      const { service, customerService, customers, customerOf } =
        buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      await service.create(dto(customer.id), SALES_A);

      // `onModuleInit` never ran, so nothing vetoes the delete of a customer with a project.
      await expect(
        customerService.remove(customer.id, MANAGER),
      ).resolves.toEqual({ id: customer.id });
      expect(customers.rows[0].isDeleted).toBe(true);
    });
  });

  describe('project delete', () => {
    it('answers 409 and keeps the row when a registered check reports a reference', async () => {
      const { service, projects, registry, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const created = await service.create(dto(customer.id), SALES_A);
      registry.registerProjectCheck('request', (id) =>
        Promise.resolve(id === created.id),
      );

      await expect(service.remove(created.id, SALES_A)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(projects.rows[0].isDeleted).toBe(false);
    });

    it('reports the referenced row as failed in a bulk delete and deletes the rest', async () => {
      const { service, projects, registry, customerOf } = buildService();
      const customer = customerOf(SALES_A.userId, 'KH_0001');
      const used = await service.create(dto(customer.id), SALES_A);
      const free = await service.create(
        dto(customer.id, { code: 'DA_0002', name: 'Tower B' }),
        SALES_A,
      );
      registry.registerProjectCheck('order', (id) =>
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
      expect(projects.rows.find((row) => row.id === used.id)?.isDeleted).toBe(
        false,
      );
    });
  });
});
