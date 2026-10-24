import {
  optionalTrimmedField,
  trimFormField,
} from "@/kernel/core/lib/form-payload";

import type {
  RequestFormInput,
  RequestFormValues,
} from "@plugins/sales/request/schemas/request.schema";
import type {
  CreateRequestDto,
  RequestDetail,
  UpdateRequestDto,
} from "@plugins/sales/request/types";

export const EMPTY_REQUEST_FORM = {
  customerId: "",
  projectId: "",
  contactId: "",
  title: "",
  technicalRequirements: "",
  requestedDeliveryDate: "",
  quotationDueDate: "",
} satisfies RequestFormInput;

export function toRequestFormValues(request: RequestDetail): RequestFormInput {
  return {
    customerId: String(request.customerId),
    projectId: request.projectId ? String(request.projectId) : "",
    contactId: request.contactId ? String(request.contactId) : "",
    title: request.title ?? "",
    technicalRequirements: request.technicalRequirements ?? "",
    requestedDeliveryDate: request.requestedDeliveryDate ?? "",
    quotationDueDate: request.quotationDueDate ?? "",
  };
}

const idOrNull = (value: string): number | null =>
  value ? Number(value) : null;
const dateOrNull = (value: string): string | null => value || null;

/** Create omits what was left empty. */
export function toRequestCreatePayload(
  data: RequestFormValues,
): CreateRequestDto {
  return {
    customerId: Number(data.customerId),
    projectId: idOrNull(data.projectId) ?? undefined,
    contactId: idOrNull(data.contactId) ?? undefined,
    title: data.title.trim(),
    technicalRequirements: optionalTrimmedField(data.technicalRequirements),
    requestedDeliveryDate: dateOrNull(data.requestedDeliveryDate) ?? undefined,
    quotationDueDate: dateOrNull(data.quotationDueDate) ?? undefined,
  };
}

/** Full-form update: clearable fields are sent explicitly; the customer is fixed. */
export function toRequestUpdatePayload(
  data: RequestFormValues,
): UpdateRequestDto {
  return {
    projectId: idOrNull(data.projectId),
    contactId: idOrNull(data.contactId),
    title: data.title.trim(),
    technicalRequirements: trimFormField(data.technicalRequirements),
    requestedDeliveryDate: dateOrNull(data.requestedDeliveryDate),
    quotationDueDate: dateOrNull(data.quotationDueDate),
  };
}
