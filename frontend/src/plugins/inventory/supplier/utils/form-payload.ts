import {
  optionalTrimmedField,
  trimFormField,
} from "@/kernel/core/lib/form-payload";

import type {
  SupplierFormInput,
  SupplierFormValues,
} from "@plugins/inventory/supplier/schemas/supplier.schema";
import type {
  CreateSupplierDto,
  Supplier,
  UpdateSupplierDto,
} from "@plugins/inventory/supplier/types";

export const EMPTY_SUPPLIER_FORM = {
  code: "",
  name: "",
  taxCode: "",
  address: "",
  phone: "",
  email: "",
  contactName: "",
  note: "",
  isActive: true,
} satisfies SupplierFormInput;

export function toSupplierFormValues(supplier: Supplier): SupplierFormInput {
  return {
    code: supplier.code,
    name: supplier.name ?? "",
    taxCode: supplier.taxCode ?? "",
    address: supplier.address ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    contactName: supplier.contactName ?? "",
    note: supplier.note ?? "",
    isActive: supplier.isActive,
  };
}

/** Create omits the empty optional fields. */
export function toSupplierCreatePayload(
  data: SupplierFormValues,
): CreateSupplierDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    taxCode: optionalTrimmedField(data.taxCode),
    address: optionalTrimmedField(data.address),
    phone: optionalTrimmedField(data.phone),
    email: optionalTrimmedField(data.email),
    contactName: optionalTrimmedField(data.contactName),
    note: optionalTrimmedField(data.note),
    isActive: data.isActive,
  };
}

/** Full-form update: always send clearable text fields explicitly. */
export function toSupplierUpdatePayload(
  data: SupplierFormValues,
): UpdateSupplierDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    taxCode: trimFormField(data.taxCode),
    address: trimFormField(data.address),
    phone: trimFormField(data.phone),
    email: trimFormField(data.email),
    contactName: trimFormField(data.contactName),
    note: trimFormField(data.note),
    isActive: data.isActive,
  };
}
