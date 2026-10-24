import {
  optionalTrimmedField,
  trimFormField,
} from "@/kernel/core/lib/form-payload";

import type {
  ProjectFormInput,
  ProjectFormValues,
} from "@plugins/crm/project/schemas/project.schema";
import type {
  CreateProjectDto,
  Project,
  UpdateProjectDto,
} from "@plugins/crm/project/types";

export const EMPTY_PROJECT_FORM = {
  code: "",
  customerId: "",
  name: "",
  siteAddress: "",
  note: "",
} satisfies ProjectFormInput;

export function toProjectFormValues(project: Project): ProjectFormInput {
  return {
    code: project.code,
    customerId: String(project.customerId),
    name: project.name ?? "",
    siteAddress: project.siteAddress ?? "",
    note: project.note ?? "",
  };
}

/** Create omits the empty optional fields. */
export function toProjectCreatePayload(
  data: ProjectFormValues,
): CreateProjectDto {
  return {
    code: data.code.trim(),
    customerId: Number(data.customerId),
    name: data.name.trim(),
    siteAddress: optionalTrimmedField(data.siteAddress),
    note: optionalTrimmedField(data.note),
  };
}

/** Full-form update: always send clearable text fields explicitly; the customer is fixed. */
export function toProjectUpdatePayload(
  data: ProjectFormValues,
): UpdateProjectDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    siteAddress: trimFormField(data.siteAddress),
    note: trimFormField(data.note),
  };
}
