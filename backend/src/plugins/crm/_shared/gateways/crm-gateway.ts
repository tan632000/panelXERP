import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
    if (!customer) return null;

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
}
