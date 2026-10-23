import {
  optionalTrimmedField,
  trimFormField,
} from "@/kernel/core/lib/form-payload";

import type {
  ContactFormInput,
  ContactFormValues,
} from "@plugins/crm/contact/schemas/contact.schema";
import type {
  Contact,
  CreateContactDto,
  UpdateContactDto,
} from "@plugins/crm/contact/types";

export const EMPTY_CONTACT_FORM: ContactFormInput = {
  name: "",
  position: "",
  phone: "",
  email: "",
  isPrimary: false,
};

export function toContactFormValues(contact: Contact): ContactFormInput {
  return {
    name: contact.name ?? "",
    position: contact.position ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    isPrimary: contact.isPrimary,
  };
}

export function toContactCreatePayload(
  customerId: number,
  data: ContactFormValues,
): CreateContactDto {
  return {
    customerId,
    name: data.name.trim(),
    position: optionalTrimmedField(data.position),
    phone: optionalTrimmedField(data.phone),
    email: optionalTrimmedField(data.email),
    isPrimary: data.isPrimary,
  };
}

/** Full-form update: always send clearable text fields explicitly. */
export function toContactUpdatePayload(
  data: ContactFormValues,
): UpdateContactDto {
  return {
    name: data.name.trim(),
    position: trimFormField(data.position),
    phone: trimFormField(data.phone),
    email: trimFormField(data.email),
    isPrimary: data.isPrimary,
  };
}
