import { z } from "zod";

import { masterDataCodeSchema } from "@/kernel/core/lib/master-data-code";
import { optionalMaxString } from "@/kernel/core/lib/validators";

import { PROJECT_CODE_PREFIX } from "@plugins/crm/project/constants";

export interface ProjectValidationMessages {
  codeRequired: string;
  codeMax: string;
  codePrefix: string;
  customerRequired: string;
  nameRequired: string;
  nameMax: string;
  siteAddressMax: string;
  noteMax: string;
}

export function createProjectSchema(messages: ProjectValidationMessages) {
  return z.object({
    code: masterDataCodeSchema({
      prefix: PROJECT_CODE_PREFIX,
      maxLength: 30,
      messages: {
        required: messages.codeRequired,
        max: messages.codeMax,
        prefix: messages.codePrefix,
      },
    }),
    /** Customer id as the picker holds it; empty until one is chosen. */
    customerId: z.string().min(1, messages.customerRequired),
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(255, messages.nameMax),
    siteAddress: optionalMaxString(500, messages.siteAddressMax),
    note: optionalMaxString(2000, messages.noteMax),
  });
}

export type ProjectFormInput = z.input<ReturnType<typeof createProjectSchema>>;
export type ProjectFormValues = z.output<
  ReturnType<typeof createProjectSchema>
>;
