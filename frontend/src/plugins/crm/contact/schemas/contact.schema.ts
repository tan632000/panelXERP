import { z } from "zod";

import { optionalMaxString } from "@/kernel/core/lib/validators";

export interface ContactValidationMessages {
  nameRequired: string;
  nameMax: string;
  positionMax: string;
  phoneMax: string;
  emailInvalid: string;
  emailMax: string;
}

export function createContactSchema(messages: ContactValidationMessages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(255, messages.nameMax),
    position: optionalMaxString(100, messages.positionMax),
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
    isPrimary: z.boolean(),
  });
}

export type ContactFormInput = z.input<ReturnType<typeof createContactSchema>>;
export type ContactFormValues = z.output<
  ReturnType<typeof createContactSchema>
>;
