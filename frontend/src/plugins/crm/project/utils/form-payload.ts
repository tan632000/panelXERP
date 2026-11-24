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
  quotationTemplateId: "",
} satisfies ProjectFormInput;

export function toProjectFormValues(project: Project): ProjectFormInput {
  return {
    code: project.code,
    customerId: String(project.customerId),
    name: project.name ?? "",
    siteAddress: project.siteAddress ?? "",
    note: project.note ?? "",
    quotationTemplateId: project.quotationTemplateId
      ? String(project.quotationTemplateId)
      : "",
  };
}

/**
 * `templateEnabled` is false when the actor cannot read templates: the picker is hidden then,
 * so the payload must not speak for a field the user never saw.
 */
interface TemplatePayloadOptions {
  templateEnabled: boolean;
  /** The template the project holds now; an update only sends the field when it changes. */
  currentTemplateId?: number | null;
}

/** Create omits the empty optional fields. */
export function toProjectCreatePayload(
  data: ProjectFormValues,
  { templateEnabled }: TemplatePayloadOptions = { templateEnabled: false },
): CreateProjectDto {
  return {
    code: data.code.trim(),
    customerId: Number(data.customerId),
    name: data.name.trim(),
    siteAddress: optionalTrimmedField(data.siteAddress),
    note: optionalTrimmedField(data.note),
    ...(templateEnabled && data.quotationTemplateId
      ? { quotationTemplateId: Number(data.quotationTemplateId) }
      : {}),
  };
}

/** Full-form update: always send clearable text fields explicitly; the customer is fixed. */
export function toProjectUpdatePayload(
  data: ProjectFormValues,
  {
    templateEnabled,
    currentTemplateId = null,
  }: TemplatePayloadOptions = { templateEnabled: false },
): UpdateProjectDto {
  // Resending an unchanged template would fail once it is switched off, blocking any edit.
  const nextTemplateId = data.quotationTemplateId
    ? Number(data.quotationTemplateId)
    : null;
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    siteAddress: trimFormField(data.siteAddress),
    note: trimFormField(data.note),
    ...(templateEnabled && nextTemplateId !== currentTemplateId
      ? { quotationTemplateId: nextTemplateId }
      : {}),
  };
}
