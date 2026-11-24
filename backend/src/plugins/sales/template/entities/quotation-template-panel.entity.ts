import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One switchboard of a template; `quantity` identical ones are built. */
@Entity('quotation_template_panels')
export class QuotationTemplatePanel {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'template_id' })
  templateId: number;

  /** Unique within the template, case-insensitively. */
  @Column({ type: 'varchar', length: 50 })
  tag: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;
}
