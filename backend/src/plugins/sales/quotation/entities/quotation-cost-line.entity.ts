import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** A non-material part of the panel (design, labor…) as named on the quotation; no amount. */
@Entity('sales_quotation_cost_lines')
export class QuotationCostLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'line_id' })
  lineId: number;

  @Column({ type: 'varchar', length: 20 })
  category: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;
}
