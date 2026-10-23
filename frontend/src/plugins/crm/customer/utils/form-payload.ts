import {
  optionalTrimmedField,
  trimFormField,
} from "@/kernel/core/lib/form-payload";

import type {
  CustomerFormInput,
  CustomerFormValues,
} from "@plugins/crm/customer/schemas/customer.schema";
import type {
  CreateCustomerDto,
  Customer,
  UpdateCustomerDto,
} from "@plugins/crm/customer/types";

function ownerId(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function toCustomerFormValues(customer: Customer): CustomerFormInput {
  return {
    code: customer.code,
    name: customer.name ?? "",
    taxCode: customer.taxCode ?? "",
    address: customer.address ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    salesOwnerId: String(customer.salesOwnerId),
    note: customer.note ?? "",
  };
}

/** Create omits the empty optional fields; an empty owner means the caller owns it. */
export function toCustomerCreatePayload(
  data: CustomerFormValues,
): CreateCustomerDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    taxCode: optionalTrimmedField(data.taxCode),
    address: optionalTrimmedField(data.address),
    phone: optionalTrimmedField(data.phone),
    email: optionalTrimmedField(data.email),
    salesOwnerId: ownerId(data.salesOwnerId),
    note: optionalTrimmedField(data.note),
  };
}

/** Full-form update: always send clearable text fields explicitly. */
export function toCustomerUpdatePayload(
  data: CustomerFormValues,
): UpdateCustomerDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    taxCode: trimFormField(data.taxCode),
    address: trimFormField(data.address),
    phone: trimFormField(data.phone),
    email: trimFormField(data.email),
    salesOwnerId: ownerId(data.salesOwnerId),
    note: trimFormField(data.note),
  };
}
