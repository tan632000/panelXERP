"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import {
  useBulkDeleteMutation,
  type BulkDeleteHookOptions,
} from "@/kernel/core/hooks/api/useBulkDeleteMutation";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { itemQueryKeys } from "@plugins/catalog/item/constants";
import {
  bulkDeleteItems,
  createItem,
  deleteItem,
  getItems,
  importItems,
  updateItem,
} from "@plugins/catalog/item/services/item.service";
import { resolveItemDeleteToastKey } from "@plugins/catalog/item/utils/map-item-api-errors";

import type {
  CreateItemDto,
  ItemListParams,
  UpdateItemDto,
} from "@plugins/catalog/item/types";

export function useItemList(params: ItemListParams = {}) {
  return useQuery({
    queryKey: itemQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => getItems(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCreateItem() {
  const t = useTranslations("item.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("item.toast");
  return useMutationFeedback({
    mutationFn: (input: CreateItemDto) => createItem(input),
    successMessage: t("createItemSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });
}

export function useUpdateItem() {
  const t = useTranslations("item.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("item.toast");
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateItemDto }) =>
      updateItem(id, data),
    successMessage: t("updateItemSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });
}

export function useDeleteItem() {
  const t = useTranslations("item.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("item.toast");
  return useMutationFeedback({
    mutationFn: (id: number) => deleteItem(id),
    successMessage: t("deleteItemSuccess"),
    ...feedback,
    resolveErrorMessage: (error) => {
      const resolved = feedback.resolveErrorMessage?.(error);
      if (resolved) return resolved;
      const toastKey = resolveItemDeleteToastKey(error);
      return toastKey ? t(toastKey) : undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });
}

/** Deletes the rows ticked in the list; refused rows stay, reported by count. */
export function useBulkDeleteItems(options?: BulkDeleteHookOptions) {
  return useBulkDeleteMutation({
    mutationFn: bulkDeleteItems,
    toastNamespace: "item.toast",
    invalidateQueryKey: itemQueryKeys.all,
    ...options,
  });
}

/** Uploads an .xlsx; the dialog shows the result (created count and rejected rows). */
export function useImportItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importItems(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });
}
