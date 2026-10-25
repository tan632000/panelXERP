import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { QuotationFeedbackChannel } from '@plugins/sales/quotation/enums/quotation-feedback-channel.enum';

/** One answer of the customer to the quotation; append-only, removed only with its quotation. */
@Entity('sales_quotation_feedbacks')
export class QuotationFeedback {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'quotation_id' })
  quotationId: number;

  /** The day the customer answered, `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'feedback_date' })
  feedbackDate: string;

  @Column({ type: 'varchar', length: 20 })
  channel: QuotationFeedbackChannel;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
