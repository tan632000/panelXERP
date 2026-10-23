import api from "@/kernel/core/api/api";

import {
  CONTACT_LIST_LIMIT,
  contactApiRoutes,
} from "@plugins/crm/contact/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  Contact,
  CreateContactDto,
  UpdateContactDto,
} from "@plugins/crm/contact/types";

export async function getCustomerContacts(
  customerId: number,
): Promise<PaginatedResponse<Contact>> {
  const { data } = await api.get<PaginatedResponse<Contact>>(
    contactApiRoutes.list,
    { params: { customerId, limit: CONTACT_LIST_LIMIT } },
  );
  return data;
}

export async function createContact(
  payload: CreateContactDto,
): Promise<Contact> {
  const { data } = await api.post<Contact>(contactApiRoutes.list, payload);
  return data;
}

export async function updateContact(
  id: number,
  payload: UpdateContactDto,
): Promise<Contact> {
  const { data } = await api.patch<Contact>(
    contactApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function deleteContact(id: number): Promise<void> {
  await api.delete(contactApiRoutes.detail(id));
}
