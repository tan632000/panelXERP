import { Injectable } from '@nestjs/common';

/** Answers whether any live document of the registering feature still points at the supplier. */
export type SupplierReferenceCheck = (supplierId: number) => Promise<boolean>;

/**
 * Lets the features that hold documents about a supplier (purchase orders) veto its deletion
 * without the supplier importing them: each registers one check at start-up and the delete
 * asks all of them.
 */
@Injectable()
export class SupplierReferenceCheckRegistry {
  private readonly checks = new Map<string, SupplierReferenceCheck>();

  /** `name` identifies the registering document kind; a second check under it is a bug. */
  register(name: string, check: SupplierReferenceCheck): void {
    if (this.checks.has(name)) {
      throw new Error(
        `Supplier reference check "${name}" is already registered`,
      );
    }
    this.checks.set(name, check);
  }

  /** The names of the checks that report the supplier as referenced, in registration order. */
  async referencing(supplierId: number): Promise<string[]> {
    const referencing: string[] = [];
    for (const [name, check] of this.checks) {
      if (await check(supplierId)) referencing.push(name);
    }
    return referencing;
  }
}
