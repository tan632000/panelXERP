"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { requestQueryKeys } from "@plugins/sales/request/constants";
import {
  assignRequest,
  cancelRequest,
  createRequest,
  deleteRequestAttachment,
  getCustomerProjectOptions,
  getEngineerOptions,
  getRequest,
  getRequestActivities,
  getRequestAttachments,
  getRequests,
  markRequestLost,
  updateRequest,
  uploadRequestAttachment,
} from "@plugins/sales/request/services/request.service";
import { resolveRequestToastKey } from "@plugins/sales/request/utils/map-request-api-errors";

import type {
  AssignRequestDto,
  CreateRequestDto,
  RequestListParams,
  RequestReasonDto,
  UpdateRequestDto,
} from "@plugins/sales/request/types";

export function useRequestList(params: RequestListParams = {}) {
  return useQuery({
    queryKey: requestQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getRequests(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useRequest(id?: number | null) {
  return useQuery({
    queryKey: requestQueryKeys.detail(id ?? 0),
    queryFn: () => getRequest(id as number),
    enabled: Boolean(id),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useRequestActivities(id: number) {
  return useQuery({
    queryKey: requestQueryKeys.activities(id),
    queryFn: () => getRequestActivities(id),
    enabled: id > 0,
  });
}

export function useRequestAttachments(id: number) {
  return useQuery({
    queryKey: requestQueryKeys.attachments(id),
    queryFn: () => getRequestAttachments(id),
    enabled: id > 0,
  });
}

/** The accounts a request may be assigned to; loaded only while a dialog needs them. */
export function useEngineerOptions(enabled = true) {
  return useQuery({
    queryKey: requestQueryKeys.engineerOptions(),
    queryFn: getEngineerOptions,
    enabled,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCustomerProjectOptions(customerId: number) {
  return useQuery({
    queryKey: requestQueryKeys.customerProjects(customerId),
    queryFn: () => getCustomerProjectOptions(customerId),
    enabled: customerId > 0,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

/** Feedback every request mutation shares: the toast namespace and the refusal wording table. */
function useRequestFeedback() {
  const t = useTranslations("request.toast");
  const feedback = useToastMutationFeedback("request.toast");
  return {
    t,
    feedback: {
      ...feedback,
      resolveErrorMessage: (error: unknown) => {
        const resolved = feedback.resolveErrorMessage?.(error);
        if (resolved) return resolved;
        const toastKey = resolveRequestToastKey(error);
        return toastKey ? t(toastKey) : undefined;
      },
    },
  };
}

export function useCreateRequest() {
  const qc = useQueryClient();
  const { t, feedback } = useRequestFeedback();
  return useMutationFeedback({
    mutationFn: (input: CreateRequestDto) => createRequest(input),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: requestQueryKeys.all });
    },
  });
}

export function useUpdateRequest() {
  const qc = useQueryClient();
  const { t, feedback } = useRequestFeedback();
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateRequestDto }) =>
      updateRequest(id, data),
    successMessage: t("updateSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: requestQueryKeys.all });
    },
  });
}

export function useAssignRequest() {
  const qc = useQueryClient();
  const { t, feedback } = useRequestFeedback();
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: AssignRequestDto }) =>
      assignRequest(id, data),
    successMessage: t("assignSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: requestQueryKeys.all });
    },
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  const { t, feedback } = useRequestFeedback();
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: RequestReasonDto }) =>
      cancelRequest(id, data),
    successMessage: t("cancelSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: requestQueryKeys.all });
    },
  });
}

export function useMarkRequestLost() {
  const qc = useQueryClient();
  const { t, feedback } = useRequestFeedback();
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: RequestReasonDto }) =>
      markRequestLost(id, data),
    successMessage: t("lostSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: requestQueryKeys.all });
    },
  });
}

export function useUploadRequestAttachment(requestId: number) {
  const qc = useQueryClient();
  const { t, feedback } = useRequestFeedback();
  return useMutationFeedback({
    mutationFn: (file: File) => uploadRequestAttachment(requestId, file),
    successMessage: t("uploadSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: requestQueryKeys.attachments(requestId),
      });
      qc.invalidateQueries({
        queryKey: requestQueryKeys.activities(requestId),
      });
    },
  });
}

export function useDeleteRequestAttachment(requestId: number) {
  const qc = useQueryClient();
  const { t, feedback } = useRequestFeedback();
  return useMutationFeedback({
    mutationFn: (attachmentId: number) =>
      deleteRequestAttachment(requestId, attachmentId),
    successMessage: t("deleteAttachmentSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: requestQueryKeys.attachments(requestId),
      });
      qc.invalidateQueries({
        queryKey: requestQueryKeys.activities(requestId),
      });
    },
  });
}
