"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import {
  getApiErrorMessageLower,
  getApiErrorStatus,
} from "@/kernel/core/lib/api-error-mapping";

import { templateQueryKeys } from "@plugins/sales/template/constants";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  getTemplates,
  setTemplateActive,
  updateTemplate,
} from "@plugins/sales/template/services/template.service";

import type {
  CreateTemplateDto,
  TemplateListParams,
  UpdateTemplateDto,
} from "@plugins/sales/template/types";

const TOAST_NAMESPACE = "template.toast";

/**
 * Maps a 400/409 refusal to the `template.toast` key that says it in the reader's language;
 * the server wording is English by contract and is only read here to tell the rules apart.
 */
export function resolveTemplateErrorKey(error: unknown): string | undefined {
  const status = getApiErrorStatus(error);
  const message = getApiErrorMessageLower(error) ?? "";
  if (status === 409) {
    // Anchored on the fixed wording, never a bare word: a panel tag the user typed
    // (e.g. "PROJECT-A") is echoed inside the message and must not read as "in use".
    if (message.startsWith("panel tag ")) return "tagExists";
    if (message.startsWith("template code ")) return "codeExists";
    if (message.includes("because a project uses it")) return "inUse";
    return "conflict";
  }
  if (status === 400) {
    return message.includes("item") ? "itemNotActive" : "invalidTemplate";
  }
  return undefined;
}

function useTemplateMutationFeedback(successKey: string) {
  const t = useTranslations(TOAST_NAMESPACE);
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback(TOAST_NAMESPACE, {
    resolveMutationError: (error) => {
      const key = resolveTemplateErrorKey(error);
      return key ? t(key) : undefined;
    },
  });
  return {
    successMessage: t(successKey),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateQueryKeys.all });
    },
  };
}

export function useTemplateList(params: TemplateListParams = {}) {
  return useQuery({
    queryKey: templateQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getTemplates(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useTemplateDetail(id: number | null) {
  return useQuery({
    queryKey: templateQueryKeys.detail(id ?? 0),
    queryFn: () => getTemplate(id as number),
    enabled: id !== null,
    // The form copies the detail once on open; a refetch must not overwrite what is typed.
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useCreateTemplate() {
  return useMutationFeedback({
    mutationFn: (input: CreateTemplateDto) => createTemplate(input),
    ...useTemplateMutationFeedback("createSuccess"),
  });
}

export function useUpdateTemplate() {
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateTemplateDto }) =>
      updateTemplate(id, data),
    ...useTemplateMutationFeedback("updateSuccess"),
  });
}

export function useSetTemplateActive() {
  const t = useTranslations(TOAST_NAMESPACE);
  const feedback = useTemplateMutationFeedback("updateSuccess");
  return useMutationFeedback({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      setTemplateActive(id, isActive),
    ...feedback,
    successMessage: (data) =>
      t(data.isActive ? "activateSuccess" : "deactivateSuccess"),
  });
}

export function useDeleteTemplate() {
  return useMutationFeedback({
    mutationFn: (id: number) => deleteTemplate(id),
    ...useTemplateMutationFeedback("deleteSuccess"),
  });
}
