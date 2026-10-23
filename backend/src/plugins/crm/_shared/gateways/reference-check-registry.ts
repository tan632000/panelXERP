import { Injectable } from '@nestjs/common';

/** Answers whether any live document of the registering plugin still points at the customer. */
export type CustomerReferenceCheck = (customerId: number) => Promise<boolean>;

/**
 * Lets plugins that hold documents about a customer (projects, requests, quotations, orders)
 * veto its deletion without CRM importing them: each registers one check at start-up and the
 * customer delete asks all of them.
 */
@Injectable()
export class ReferenceCheckRegistry {
  private readonly customerChecks = new Map<string, CustomerReferenceCheck>();

  /** `name` identifies the registering document kind; a second check under it is a bug. */
  registerCustomerCheck(name: string, check: CustomerReferenceCheck): void {
    if (this.customerChecks.has(name)) {
      throw new Error(
        `Customer reference check "${name}" is already registered`,
      );
    }
    this.customerChecks.set(name, check);
  }

  /** The names of the checks that report the customer as referenced, in registration order. */
  async referencingCustomer(customerId: number): Promise<string[]> {
    const referencing: string[] = [];
    for (const [name, check] of this.customerChecks) {
      if (await check(customerId)) referencing.push(name);
    }
    return referencing;
  }
}
