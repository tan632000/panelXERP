import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';
import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import type { ItemGroup } from '@plugins/catalog/item/enums/item-group.enum';

@Entity('items')
export class Item extends BaseEntity {
  /** Manufacturer part number or internal code, unique among active rows (case-insensitive). */
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  specification?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand?: string | null;

  /** `group` is a reserved word in SQL, so the column is `item_group`. */
  @Column({ type: 'varchar', length: 20, name: 'item_group' })
  group: ItemGroup;

  @Column({ type: 'varchar', length: 20 })
  unit: string;

  /** Reference purchase price in VND. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'reference_price',
    nullable: true,
    transformer: numericColumnTransformer,
  })
  referencePrice?: number | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** What a scanner reads off the item; unique among active rows (any case) and never another item's code. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  barcode?: string | null;

  @Column({ type: 'int', name: 'default_location_id', nullable: true })
  defaultLocationId?: number | null;

  /** Available stock below this raises a shortage alert; `null` means no alert. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    name: 'min_stock',
    nullable: true,
    transformer: numericColumnTransformer,
  })
  minStock?: number | null;
}
