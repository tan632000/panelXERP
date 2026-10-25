import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import { CostCategory } from '@plugins/sales/estimate/enums/cost-category.enum';

/** A cost of building ONE panel that is not a material: design, labor, installation… */
@Entity('sales_estimate_cost_lines')
export class EstimateCostLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'panel_id' })
  panelId: number;

  @Column({ type: 'varchar', length: 20 })
  category: CostCategory;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  /** Cost for one panel, whole VND. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  amount: number;
}
