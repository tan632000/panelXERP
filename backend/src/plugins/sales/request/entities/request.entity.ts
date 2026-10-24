import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

/**
 * A quote request, the first document of the sales chain. The code is a document number: unique over every
 * row, deleted ones included, so a number is never handed out twice.
 */
@Entity('sales_requests')
export class SalesRequest extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'customer_id' })
  customerId: number;

  @Column({ type: 'int', name: 'project_id', nullable: true })
  projectId?: number | null;

  @Column({ type: 'int', name: 'contact_id', nullable: true })
  contactId?: number | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', name: 'technical_requirements', nullable: true })
  technicalRequirements?: string | null;

  /** Calendar date as `YYYY-MM-DD`; no time zone applies to it. */
  @Column({ type: 'date', name: 'requested_delivery_date', nullable: true })
  requestedDeliveryDate?: string | null;

  /** Calendar date as `YYYY-MM-DD`; no time zone applies to it. */
  @Column({ type: 'date', name: 'quotation_due_date', nullable: true })
  quotationDueDate?: string | null;

  /** The sales account that owns the request; a Sales actor reads only these rows. */
  @Column({ type: 'int', name: 'sales_owner_id' })
  salesOwnerId: number;

  /** The engineer the request is assigned to; an Engineer actor reads only these rows. */
  @Column({ type: 'int', name: 'assigned_engineer_id', nullable: true })
  assignedEngineerId?: number | null;

  @Column({ type: 'varchar', length: 20, default: RequestStatus.DRAFT })
  status: RequestStatus;

  @Column({ type: 'text', name: 'cancel_reason', nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'text', name: 'lost_reason', nullable: true })
  lostReason?: string | null;
}
