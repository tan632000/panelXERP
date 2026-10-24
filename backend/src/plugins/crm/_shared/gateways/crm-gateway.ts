import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';

import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';

/** What a later document snapshots about a project. */
export interface ProjectSummary {
  id: number;
  code: string;
  name: string;
  siteAddress: string | null;
  customerId: number;
  isDeleted: boolean;
}

/** What a later document shows about a customer's contact person. */
export interface ContactSummary {
  id: number;
  customerId: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isDeleted: boolean;
}

/** What a later document snapshots about a customer. */
export interface CustomerSummary {
  id: number;
  code: string;
  name: string;
  taxCode: string | null;
  address: string | null;
  salesOwnerId: number;
  isDeleted: boolean;
}

/**
 * How other plugins read customers. Applies no data scope: the caller already decided the
 * actor may reach the document it is building and applies its own owner check to it.
 */
@Injectable()
export class CrmGateway {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
  ) {}

  /**
   * The customer's summary, soft-deleted rows included: a document keeps naming a customer
   * after it is deleted, so a deleted customer must still resolve. `null` for an unknown id.
   */
  async getCustomerSummary(id: number): Promise<CustomerSummary | null> {
    const customer = await this.customerRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    return customer ? toCustomerSummary(customer) : null;
  }

  /** Summaries of many customers in one read, soft-deleted ones included, keyed by id. */
  async getCustomerSummaries(
    ids: readonly number[],
  ): Promise<Map<number, CustomerSummary>> {
    if (ids.length === 0) return new Map();
    const customers = await this.customerRepo.find({
      where: { id: In([...new Set(ids)]) },
      withDeleted: true,
    });
    return new Map(
      customers.map((customer) => [customer.id, toCustomerSummary(customer)]),
    );
  }

  /**
   * The customer's current sales owner, read inside the caller's transaction under a shared
   * row lock. A document that must carry its customer's owner reads it here at the moment it
   * is inserted: the lock conflicts with the row lock of a CRM reassignment, so the two
   * serialize — either the document sees the new owner, or it commits first and the
   * reassignment's owner-change hook moves it. `null` for an unknown or deleted customer.
   */
  async lockCustomerOwner(
    manager: EntityManager,
    customerId: number,
  ): Promise<number | null> {
    const rows: Array<{ sales_owner_id: number }> = await manager.query(
      'SELECT sales_owner_id FROM customers WHERE id = $1 AND is_deleted = false FOR SHARE',
      [customerId],
    );
    return rows.length > 0 ? rows[0].sales_owner_id : null;
  }

  /**
   * The project's summary, soft-deleted rows included, for the same reason as customers: a
   * document keeps naming its project after it is deleted. `null` for an unknown id.
   */
  async getProjectSummary(id: number): Promise<ProjectSummary | null> {
    const project = await this.projectRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!project) return null;

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      siteAddress: project.siteAddress ?? null,
      customerId: project.customerId,
      isDeleted: project.isDeleted,
    };
  }

  /**
   * The contact's summary, soft-deleted rows included, for the same reason as customers: a
   * document keeps naming its contact after it is deleted. `null` for an unknown id.
   */
  async getContactSummary(id: number): Promise<ContactSummary | null> {
    const contact = await this.contactRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!contact) return null;
    return {
      id: contact.id,
      customerId: contact.customerId,
      name: contact.name,
      position: contact.position ?? null,
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      isDeleted: contact.isDeleted,
    };
  }
}

function toCustomerSummary(customer: Customer): CustomerSummary {
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    taxCode: customer.taxCode ?? null,
    address: customer.address ?? null,
    salesOwnerId: customer.salesOwnerId,
    isDeleted: customer.isDeleted,
  };
}
