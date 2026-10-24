import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Item } from '@plugins/catalog/item/entities/item.entity';

import type { ItemGroup } from '@plugins/catalog/item/enums/item-group.enum';

/** What a later document reads about an item. */
export interface ItemSummary {
  id: number;
  code: string;
  name: string;
  specification: string | null;
  brand: string | null;
  group: ItemGroup;
  unit: string;
  referencePrice: number | null;
  isDeleted: boolean;
}

/** How other plugins read catalog items. The catalog is shared, so no data scope applies. */
@Injectable()
export class CatalogGateway {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  /**
   * The summaries of the given items, soft-deleted rows included: a document keeps naming an
   * item after it is deleted. Unknown ids are omitted.
   */
  async getItems(ids: number[]): Promise<ItemSummary[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const items = await this.itemRepo.find({
      where: { id: In(unique) },
      withDeleted: true,
    });
    return items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      specification: item.specification ?? null,
      brand: item.brand ?? null,
      group: item.group,
      unit: item.unit,
      referencePrice: item.referencePrice ?? null,
      isDeleted: item.isDeleted,
    }));
  }
}
