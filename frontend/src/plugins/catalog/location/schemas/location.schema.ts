import { z } from "zod";

import { optionalMaxString } from "@/kernel/core/lib/validators";

export interface LocationValidationMessages {
  codeRequired: string;
  codeMax: string;
  nameRequired: string;
  nameMax: string;
  noteMax: string;
}

export function createLocationSchema(messages: LocationValidationMessages) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, messages.codeRequired)
      .max(32, messages.codeMax),
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(255, messages.nameMax),
    note: optionalMaxString(2000, messages.noteMax),
    isActive: z.boolean(),
  });
}

export type LocationFormInput = z.input<
  ReturnType<typeof createLocationSchema>
>;
export type LocationFormValues = z.output<
  ReturnType<typeof createLocationSchema>
>;
