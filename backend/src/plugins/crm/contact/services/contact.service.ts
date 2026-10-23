import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { uniqueViolationConflict } from '@shared/utils/db-error.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';

import { ownerCondition } from '@plugins/crm/_shared/utils/owner-scope.util';
import { requireText, trimToNull } from '@plugins/crm/_shared/utils/text.util';
import { ContactFilterDto } from '@plugins/crm/contact/dto/contact-filter.dto';
import { CreateContactDto } from '@plugins/crm/contact/dto/create-contact.dto';
import { UpdateContactDto } from '@plugins/crm/contact/dto/update-contact.dto';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const CONTACT_LABEL = 'Contact';
const CUSTOMER_LABEL = 'Customer';

/** Name of the partial unique index that allows one active primary contact per customer. */
const PRIMARY_CONTACT_INDEX = 'uq_contacts_primary_per_customer';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly dataScope: DataScopeService,
  ) {}

  /** Contacts of the customers the actor can see; the primary contact comes first. */
  async findAll(query: ContactFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const base: Record<string, unknown> = {
      isDeleted: false,
      customer: {
        isDeleted: false,
        ...ownerCondition(this.dataScope.scopeOf(actor), actor.userId),
      },
    };
    if (query.customerId) base.customerId = query.customerId;

    const where = buildIlikeOrWhere(
      base,
      ['name', 'position', 'phone', 'email'],
      query.search,
    );

    const [data, total] = await this.contactRepo.findAndCount({
      where,
      skip,
      take,
      order: { isPrimary: 'DESC', name: 'ASC', id: 'ASC' },
    });

    return paginate(data, total, page, limit);
  }

  findOne(id: number, actor: AuthUserPayload): Promise<Contact> {
    return this.findVisible(id, actor);
  }

  async create(
    dto: CreateContactDto,
    actor: AuthUserPayload,
  ): Promise<Contact> {
    // A customer the actor cannot see answers 404, so its id cannot be probed through contacts.
    await this.findVisibleCustomer(dto.customerId, actor);

    const contact = this.contactRepo.create({
      customerId: dto.customerId,
      name: requireText(dto.name, 'Contact name is required.'),
      position: trimToNull(dto.position),
      phone: trimToNull(dto.phone),
      email: trimToNull(dto.email),
      isPrimary: dto.isPrimary ?? false,
      createdBy: actor.userId,
      isDeleted: false,
    });

    return this.save(contact);
  }

  async update(
    id: number,
    dto: UpdateContactDto,
    actor: AuthUserPayload,
  ): Promise<Contact> {
    const contact = await this.findVisible(id, actor);

    if (dto.name !== undefined) {
      contact.name = requireText(dto.name, 'Contact name is required.');
    }
    if (dto.position !== undefined) contact.position = trimToNull(dto.position);
    if (dto.phone !== undefined) contact.phone = trimToNull(dto.phone);
    if (dto.email !== undefined) contact.email = trimToNull(dto.email);
    // The flag is a boolean, never cleared: an explicit null changes nothing.
    if (dto.isPrimary !== undefined && dto.isPrimary !== null) {
      contact.isPrimary = dto.isPrimary;
    }
    contact.updatedBy = actor.userId;

    return this.save(contact);
  }

  async remove(id: number, actor: AuthUserPayload) {
    const contact = await this.findVisible(id, actor);
    return softDeleteWithAudit(this.contactRepo, contact, actor.userId);
  }

  /**
   * Saves the contact; a contact becoming primary demotes the customer's previous primary in
   * the same transaction, so the one-primary rule never needs a second request to hold.
   */
  private async save(contact: Contact): Promise<Contact> {
    try {
      return await this.contactRepo.manager.transaction(
        async (manager: EntityManager) => {
          if (contact.isPrimary) {
            await this.demoteOtherPrimaries(manager, contact);
          }
          return manager.save(contact);
        },
      );
    } catch (error: unknown) {
      // Only a concurrent request can reach the index after the demotion above.
      throw (
        uniqueViolationConflict(error, [
          {
            matches: [PRIMARY_CONTACT_INDEX],
            message: 'Customer already has a primary contact.',
          },
        ]) ?? error
      );
    }
  }

  private async demoteOtherPrimaries(
    manager: EntityManager,
    contact: Contact,
  ): Promise<void> {
    await manager.update(
      Contact,
      {
        customerId: contact.customerId,
        isPrimary: true,
        isDeleted: false,
        ...(contact.id ? { id: Not(contact.id) } : {}),
      },
      { isPrimary: false, updatedBy: contact.updatedBy ?? contact.createdBy },
    );
  }

  /** A contact is visible exactly when its customer is: visibility follows the owner. */
  private async findVisible(
    id: number,
    actor: AuthUserPayload,
  ): Promise<Contact> {
    const contact = await this.contactRepo.findOne({
      where: { id, isDeleted: false, customer: { isDeleted: false } },
      relations: { customer: true },
    });
    this.dataScope.assertVisible(actor, contact?.customer, CONTACT_LABEL);
    return contact as Contact;
  }

  private async findVisibleCustomer(
    id: number,
    actor: AuthUserPayload,
  ): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id, isDeleted: false },
    });
    return this.dataScope.assertVisible(actor, customer, CUSTOMER_LABEL);
  }
}
