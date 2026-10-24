import { z } from "zod";

import { optionalMaxString } from "@/kernel/core/lib/validators";

import {
  REQUEST_REQUIREMENTS_MAX,
  REQUEST_TITLE_MAX,
} from "@plugins/sales/request/constants";

export interface RequestValidationMessages {
  customerRequired: string;
  titleRequired: string;
  titleMax: string;
  requirementsMax: string;
  dateInvalid: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date as the date input holds it, or empty for "not set". */
function optionalDate(message: string) {
  return z
    .string()
    .refine((value) => value === "" || ISO_DATE.test(value), message);
}

export function createRequestSchema(messages: RequestValidationMessages) {
  return z.object({
    /** Customer id as the picker holds it; empty until one is chosen. */
    customerId: z.string().min(1, messages.customerRequired),
    /** Project and contact ids as the selects hold them; empty means none. */
    projectId: z.string(),
    contactId: z.string(),
    title: z
      .string()
      .trim()
      .min(1, messages.titleRequired)
      .max(REQUEST_TITLE_MAX, messages.titleMax),
    technicalRequirements: optionalMaxString(
      REQUEST_REQUIREMENTS_MAX,
      messages.requirementsMax,
    ),
    requestedDeliveryDate: optionalDate(messages.dateInvalid),
    quotationDueDate: optionalDate(messages.dateInvalid),
  });
}

export type RequestFormInput = z.input<ReturnType<typeof createRequestSchema>>;
export type RequestFormValues = z.output<
  ReturnType<typeof createRequestSchema>
>;
