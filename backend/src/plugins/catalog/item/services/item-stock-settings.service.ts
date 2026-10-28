import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { rethrowUniqueViolation } from '@shared/utils/db-error.util';
import { findActiveByIdOrThrow } from '@shared/utils/repository.util';
import { caseInsensitiveEquals } from '@shared/utils/typeorm-search.util';

import { trimToNull } from '@plugins/catalog/_shared/utils/text.util';
import { UpdateItemStockSettingsDto } from '@plugins/catalog/item/dto/update-item-stock-settings.dto';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import {
  assertBarcodeAvailable,
  lockItemIdentifiers,
} from '@plugins/catalog/item/utils/item-identifier.util';
import { Location } from '@plugins/catalog/location/entities/location.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** What a scanner needs to act on an item: no price, only identity and where it is kept. */
export interface ResolvedItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  brand: string | null;
  barcode: string | null;
  defaultLocationCode: string | null;
}

export interface DefaultLocationSummary {
  id: number;
  code: string;
  name: string;
}

/** The warehouse side of an item: its three stock fields, and the scan lookup built on them. */
@Injectable()
export class ItemStockSettingsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
  ) {}

  /** The active item a scanned value stands for: by barcode first, else by code (any case). */
  async resolve(value: string): Promise<ResolvedItem> {
    const find = (field: 'barcode' | 'code') =>
      this.itemRepo.findOne({
        where: { [field]: caseInsensitiveEquals(value), isDeleted: false },
      });
    const item = (await find('barcode')) ?? (await find('code'));
    if (!item) throw new NotFoundException(`No item for ${value}`);

    const [withLocation] = await this.withDefaultLocations([item]);
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      brand: item.brand ?? null,
      barcode: item.barcode ?? null,
      defaultLocationCode: withLocation.defaultLocation?.code ?? null,
    };
  }

  /** The items with their default location attached, read in one query for the whole page. */
  async withDefaultLocations<T extends { defaultLocationId?: number | null }>(
    items: T[],
  ): Promise<Array<T & { defaultLocation: DefaultLocationSummary | null }>> {
    const ids = [
      ...new Set(
        items.flatMap((item) =>
          item.defaultLocationId == null ? [] : [item.defaultLocationId],
        ),
      ),
    ];
    const found =
      ids.length === 0
        ? []
        : await this.locationRepo.find({ where: { id: In(ids) } });
    const byId = new Map(found.map((location) => [location.id, location]));

    return items.map((item) => {
      const location =
        item.defaultLocationId == null
          ? undefined
          : byId.get(item.defaultLocationId);
      return {
        ...item,
        defaultLocation: location
          ? { id: location.id, code: location.code, name: location.name }
          : null,
      };
    });
  }

  async update(
    id: number,
    dto: UpdateItemStockSettingsDto,
    actor: AuthUserPayload,
  ): Promise<Item> {
    let newBarcode: string | null = null;
    try {
      return await this.itemRepo.manager.transaction(async (manager) => {
        const itemRepo = manager.getRepository(Item);
        const item = await findActiveByIdOrThrow(itemRepo, id, 'Item');

        // Only a changed value is checked: the form sends every field on each save, and a
        // location deactivated since it was chosen must not block saving the others.
        if (dto.barcode !== undefined) {
          const barcode = trimToNull(dto.barcode);
          if (barcode !== (item.barcode ?? null)) {
            if (barcode) {
              await lockItemIdentifiers(manager, [barcode]);
              await assertBarcodeAvailable(itemRepo, barcode, id);
              newBarcode = barcode;
            }
            item.barcode = barcode;
          }
        }
        if (
          dto.defaultLocationId !== undefined &&
          dto.defaultLocationId !== (item.defaultLocationId ?? null)
        ) {
          if (dto.defaultLocationId !== null) {
            await this.lockUsableLocation(manager, dto.defaultLocationId);
          }
          item.defaultLocationId = dto.defaultLocationId;
        }
        if (dto.minStock !== undefined) item.minStock = dto.minStock;
        item.updatedBy = actor.userId;

        return itemRepo.save(item);
      });
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, async () => {
        if (newBarcode) {
          await assertBarcodeAvailable(this.itemRepo, newBarcode, id);
        }
      });
    }
  }

  /**
   * Reads the location under an exclusive row lock held until the save commits, so deleting it
   * cannot slip in between this check and the item pointing at it (the delete takes the same
   * lock before it looks for items using the location).
   */
  private async lockUsableLocation(
    manager: EntityManager,
    locationId: number,
  ): Promise<void> {
    const location = await manager.getRepository(Location).findOne({
      where: { id: locationId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!location?.isActive) {
      throw new BadRequestException(
        'Default location must be an active location.',
      );
    }
  }
}
