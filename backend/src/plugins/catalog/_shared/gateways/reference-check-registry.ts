import { Injectable } from '@nestjs/common';

/** Answers whether any live document of the registering plugin still points at the item. */
export type ItemReferenceCheck = (itemId: number) => Promise<boolean>;

/**
 * Lets plugins that hold documents using an item (estimate BOM lines) veto its deletion
 * without the catalog importing them: each registers one check at start-up and the delete
 * asks all of them.
 */
@Injectable()
export class ReferenceCheckRegistry {
  private readonly itemChecks = new Map<string, ItemReferenceCheck>();

  /** `name` identifies the registering document kind; a second check under it is a bug. */
  registerItemCheck(name: string, check: ItemReferenceCheck): void {
    if (this.itemChecks.has(name)) {
      throw new Error(`Item reference check "${name}" is already registered`);
    }
    this.itemChecks.set(name, check);
  }

  /** The names of the checks that report the item as referenced, in registration order. */
  async referencingItem(itemId: number): Promise<string[]> {
    const referencing: string[] = [];
    for (const [name, check] of this.itemChecks) {
      if (await check(itemId)) referencing.push(name);
    }
    return referencing;
  }
}
