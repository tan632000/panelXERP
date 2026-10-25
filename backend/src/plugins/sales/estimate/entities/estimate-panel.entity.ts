import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One switchboard of a revision, e.g. `MSB-01`; `quantity` identical ones are built. */
@Entity('sales_estimate_panels')
export class EstimatePanel {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'revision_id' })
  revisionId: number;

  /** Unique within the revision, case-insensitively. */
  @Column({ type: 'varchar', length: 50 })
  tag: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** Cost of ONE panel: Σ BOM line amounts + Σ cost lines, VND. Computed by the server. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'unit_cost',
    default: 0,
    transformer: numericColumnTransformer,
  })
  unitCost: number;

  /** `unitCost × quantity`, VND. Computed by the server. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: numericColumnTransformer,
  })
  total: number;
}
