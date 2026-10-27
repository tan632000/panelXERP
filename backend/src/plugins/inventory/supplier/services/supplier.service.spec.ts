import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';
import { SupplierService } from '@plugins/inventory/supplier/services/supplier.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { CreateSupplierDto } from '@plugins/inventory/supplier/dto/create-supplier.dto';
import type { Supplier } from '@plugins/inventory/supplier/entities/supplier.entity';

const PURCHASING: AuthUserPayload = { userId: 50, role: 'purchasing' };

type SupplierRow = Supplier & FakeRow;

function buildService() {
  const suppliers = new FakeRepo<SupplierRow>({
    unique: [
      {
        constraint: 'uq_suppliers_code_active',
        collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
      },
    ],
  });
  const registry = new SupplierReferenceCheckRegistry();
  const service = new SupplierService(suppliers as never, registry);
  return { service, suppliers, registry };
}

function dto(overrides: Partial<CreateSupplierDto> = {}): CreateSupplierDto {
  return { code: 'NCC_0001', name: 'Thep Viet', ...overrides };
}

describe('SupplierService', () => {
  describe('code uniqueness', () => {
    it('answers 409 when an active supplier has the code in a different case', async () => {
      const { service } = buildService();
      await service.create(dto(), PURCHASING);

      await expect(
        service.create(dto({ code: 'ncc_0001', name: 'Other' }), PURCHASING),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 409 when a concurrent create wins the unique index', async () => {
      const { service, suppliers } = buildService();
      // The pre-check sees nothing; the index then refuses the insert.
      suppliers.rows.push({
        id: 99,
        code: 'NCC_0001',
        name: 'Raced',
        isActive: true,
        isDeleted: false,
      } as SupplierRow);
      suppliers.findOne.mockResolvedValueOnce(null);

      await expect(service.create(dto(), PURCHASING)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lets a soft-deleted supplier’s code be used again', async () => {
      const { service, suppliers } = buildService();
      const first = await service.create(dto(), PURCHASING);
      await service.remove(first.id, PURCHASING);
      expect(suppliers.rows[0].isDeleted).toBe(true);

      const reused = await service.create(
        dto({ name: 'Thep Viet again' }),
        PURCHASING,
      );

      expect(reused.code).toBe('NCC_0001');
      expect(reused.id).not.toBe(first.id);
    });

    it('refuses to re-code a supplier onto another active code, in any case', async () => {
      const { service } = buildService();
      await service.create(dto({ code: 'NCC_0001' }), PURCHASING);
      const second = await service.create(
        dto({ code: 'NCC_0002', name: 'Beta' }),
        PURCHASING,
      );

      await expect(
        service.update(second.id, { code: 'ncc_0001' }, PURCHASING),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.update(second.id, { code: 'NCC_0002' }, PURCHASING),
      ).resolves.toMatchObject({ code: 'NCC_0002' });
    });
  });

  describe('delete', () => {
    it('answers 409 and keeps the row when a registered check reports a reference', async () => {
      const { service, suppliers, registry } = buildService();
      const created = await service.create(dto(), PURCHASING);
      registry.register('purchase-order', (id) =>
        Promise.resolve(id === created.id),
      );

      await expect(
        service.remove(created.id, PURCHASING),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(suppliers.rows[0].isDeleted).toBe(false);
    });

    it('reports the referenced row as failed in a bulk delete and deletes the rest', async () => {
      const { service, suppliers, registry } = buildService();
      const used = await service.create(dto({ code: 'NCC_0001' }), PURCHASING);
      const free = await service.create(
        dto({ code: 'NCC_0002', name: 'Beta' }),
        PURCHASING,
      );
      registry.register('purchase-order', (id) =>
        Promise.resolve(id === used.id),
      );

      const result = await service.removeMany([used.id, free.id], PURCHASING);

      expect(result.deleted).toEqual([free.id]);
      expect(result.failed).toEqual([
        {
          id: used.id,
          message: expect.stringContaining('referenced') as string,
        },
      ]);
      expect(suppliers.rows.find((row) => row.id === used.id)?.isDeleted).toBe(
        false,
      );
    });

    it('deletes when no registered check reports a reference, and then hides the row', async () => {
      const { service, registry } = buildService();
      const created = await service.create(dto(), PURCHASING);
      const check = jest.fn().mockResolvedValue(false);
      registry.register('purchase-order', check);

      await expect(service.remove(created.id, PURCHASING)).resolves.toEqual({
        id: created.id,
      });
      expect(check).toHaveBeenCalledWith(created.id);
      await expect(service.findOne(created.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('fields', () => {
    it('defaults a new supplier to active and keeps the trimmed contact fields', async () => {
      const { service } = buildService();
      const created = await service.create(
        dto({ contactName: '  Anh Nam ', phone: ' ' }),
        PURCHASING,
      );

      expect(created).toMatchObject({
        isActive: true,
        contactName: 'Anh Nam',
        phone: null,
        createdBy: PURCHASING.userId,
      });
    });

    it('clears optional fields sent as null, deactivates, and rejects a null or blank name', async () => {
      const { service } = buildService();
      const created = await service.create(
        dto({ taxCode: '0101234567', address: 'Somewhere' }),
        PURCHASING,
      );

      const updated = await service.update(
        created.id,
        { taxCode: null, address: null, isActive: false } as never,
        PURCHASING,
      );
      expect(updated.taxCode).toBeNull();
      expect(updated.address).toBeNull();
      expect(updated.isActive).toBe(false);

      for (const name of [null, '', '   ']) {
        await expect(
          service.update(created.id, { name } as never, PURCHASING),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        service.create(dto({ code: 'NCC_0002', name: '   ' }), PURCHASING),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
