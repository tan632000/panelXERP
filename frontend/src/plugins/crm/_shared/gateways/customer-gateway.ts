import { customerQueryKeys } from "@plugins/crm/customer/constants";
import { getCustomers } from "@plugins/crm/customer/services/customer.service";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type { Customer } from "@plugins/crm/customer/types";

/**
 * How other plugins page through the customers an actor may pick from. The endpoint applies
 * the actor's data scope, so a picker built on it can only offer customers the actor can see.
 */
export function fetchCustomerPickerPage(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<PaginatedResponse<Customer>> {
  return getCustomers(params);
}

/** Query key of a customer picker's search, under the customers key so edits refresh it. */
export function customerPickerQueryKey(search: string) {
  return [...customerQueryKeys.all, "picker", search] as const;
}
