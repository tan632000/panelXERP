"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";
import { useNextCodeErrorToast } from "@/kernel/core/hooks/useNextCodeErrorToast";

import {
  useCreateProject,
  useNextProjectCode,
  useUpdateProject,
} from "@plugins/crm/project/hooks/api/useProject";
import { useProjectFormSchema } from "@plugins/crm/project/hooks/useProjectFormSchema";
import {
  EMPTY_PROJECT_FORM,
  toProjectCreatePayload,
  toProjectFormValues,
  toProjectUpdatePayload,
} from "@plugins/crm/project/utils/form-payload";
import { mapProjectApiErrorsToForm } from "@plugins/crm/project/utils/map-project-api-errors";

import { ProjectFormFields } from "./ProjectFormFields";

import type {
  ProjectFormInput,
  ProjectFormValues,
} from "@plugins/crm/project/schemas/project.schema";
import type { Project } from "@plugins/crm/project/types";

interface ProjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The project being edited; absent when creating a new one. */
  project?: Project | null;
}

export function ProjectFormModal({
  isOpen,
  onClose,
  project,
}: ProjectFormModalProps) {
  const t = useTranslations("project");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useProjectFormSchema();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const nextCodeQuery = useNextProjectCode(isOpen && !project);
  useNextCodeErrorToast(nextCodeQuery.isError, "project.toast");

  const form = useForm<ProjectFormInput>({
    resolver: zodResolver(schema) as Resolver<ProjectFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_PROJECT_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset(project ? toProjectFormValues(project) : EMPTY_PROJECT_FORM);
  }, [isOpen, project, form]);

  // The suggested code may arrive after the user has started filling the form, so it only
  // fills an empty code field instead of resetting the customer and name already chosen.
  const suggestedCode = nextCodeQuery.data?.code;
  useEffect(() => {
    if (!isOpen || project || !suggestedCode) return;
    if (!form.getValues("code")) {
      form.setValue("code", suggestedCode, { shouldDirty: false });
    }
  }, [isOpen, project, suggestedCode, form]);

  const handleApiError = useFormApiErrorReporter(form, "project.toast");

  const handleSave = async (data: ProjectFormInput) => {
    const values = data as ProjectFormValues;
    try {
      if (project) {
        await updateMutation.mutateAsync({
          id: project.id,
          data: toProjectUpdatePayload(values),
        });
      } else {
        await createMutation.mutateAsync(toProjectCreatePayload(values));
      }
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapProjectApiErrorsToForm(
          error,
          setFieldError,
          { codeExists: tValidation("codeExists") },
          tValidation,
        ),
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        project
          ? t("editModalTitle", { code: project.code })
          : t("addModalTitle")
      }
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <ProjectFormFields form={form} project={project ?? undefined} />
    </Modal>
  );
}
