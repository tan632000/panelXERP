import { z } from "zod";

import { optionalMaxString } from "@/kernel/core/lib/validators";

export interface SupplierValidationMessages {
  codeRequired: string;
  codeMax: string;
  nameRequired: string;
  nameMax: string;
  taxCodeMax: string;
  addressMax: string;
  phoneMax: string;
  emailInvalid: string;
  emailMax: string;
  contactNameMax: string;
  noteMax: string;
}

export function createSupplierSchema(messages: SupplierValidationMessages) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, messages.codeRequired)
      .max(64, messages.codeMax),
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
    contactName: optionalMaxString(255, messages.contactNameMax),
    note: optionalMaxString(2000, messages.noteMax),
    isActive: z.boolean(),
  });
}

export type SupplierFormInput = z.input<
  ReturnType<typeof createSupplierSchema>
>;
export type SupplierFormValues = z.output<
  ReturnType<typeof createSupplierSchema>
>;
