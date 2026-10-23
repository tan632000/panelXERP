import { z } from "zod";

import { masterDataCodeSchema } from "@/kernel/core/lib/master-data-code";
import { optionalMaxString } from "@/kernel/core/lib/validators";

import { CUSTOMER_CODE_PREFIX } from "@plugins/crm/customer/constants";

export interface CustomerValidationMessages {
  codeRequired: string;
  codeMax: string;
  codePrefix: string;
  nameRequired: string;
  nameMax: string;
  taxCodeMax: string;
  addressMax: string;
  phoneMax: string;
  emailInvalid: string;
  emailMax: string;
  noteMax: string;
}

function buildCustomerObjectSchema(messages: CustomerValidationMessages) {
  return z.object({
    code: masterDataCodeSchema({
      prefix: CUSTOMER_CODE_PREFIX,
      maxLength: 30,
      messages: {
        required: messages.codeRequired,
        max: messages.codeMax,
        prefix: messages.codePrefix,
      },
    }),
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(255, messages.nameMax),
    taxCode: optionalMaxString(20, messages.taxCodeMax),
    address: optionalMaxString(500, messages.addressMax),
    phone: optionalMaxString(20, messages.phoneMax),
    email: z
      .union([
        z.literal(""),
        z
          .string()
          .trim()
          .max(255, messages.emailMax)
          .pipe(z.email(messages.emailInvalid)),
      ])
      .optional(),
    /** Owner account id as the select holds it; empty means the caller. */
    salesOwnerId: z.string().optional(),
    note: optionalMaxString(2000, messages.noteMax),
  });
}

export function createCustomerSchema(messages: CustomerValidationMessages) {
  return buildCustomerObjectSchema(messages);
}

export type CustomerFormInput = z.input<
  ReturnType<typeof buildCustomerObjectSchema>
>;
export type CustomerFormValues = z.output<
  ReturnType<typeof createCustomerSchema>
>;
