"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";
import { getApiErrorStatus } from "@/kernel/core/lib/api-error-mapping";

import { deliveryNoteQueryKeys } from "@plugins/delivery/delivery-note/constants";
import {
  cancelDeliveryNote,
  createDeliveryNote,
  getDeliverableOrders,
  getDeliveryNote,
  getDeliveryNotes,
  getDeliveryOrder,
  receiveDeliveryNote,
  shipDeliveryNote,
} from "@plugins/delivery/delivery-note/services/delivery-note.service";
import { refusedUnitCodes } from "@plugins/delivery/delivery-note/utils/refused-units";
import { qcQueryKeys } from "@plugins/delivery/qc-inspection/constants";

import type {
  DeliveryNoteInput,
  DeliveryNoteListParams,
  ReceiveInput,
} from "@plugins/delivery/delivery-note/types";

const TOAST = "delivery.toast";

export function useDeliveryNotes(params: DeliveryNoteListParams) {
  return useQuery({
    queryKey: deliveryNoteQueryKeys.list({ ...params }),
    queryFn: () => getDeliveryNotes(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useDeliveryNote(id: number | null) {
  return useQuery({
    queryKey: deliveryNoteQueryKeys.detail(id ?? 0),
    queryFn: () => getDeliveryNote(id as number),
    enabled: id !== null && id > 0,
  });
}

export function useDeliverableOrders() {
  return useQuery({
    queryKey: deliveryNoteQueryKeys.deliverable(),
    queryFn: () => getDeliverableOrders(),
  });
}

export function useDeliveryOrder(orderId: number | null) {
  return useQuery({
    queryKey: deliveryNoteQueryKeys.order(orderId ?? 0),
    queryFn: () => getDeliveryOrder(orderId as number),
    enabled: orderId !== null && orderId > 0,
  });
}

/** A note's status moves the cabinets' delivery status and QC lists' orders, so all reload. */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: deliveryNoteQueryKeys.all }),
      qc.invalidateQueries({ queryKey: qcQueryKeys.all }),
    ]);
}

function useNoteFeedback(extra?: (status: number | undefined) => string | undefined) {
  const t = useTranslations(TOAST);
  return useToastMutationFeedback(TOAST, {
    resolveMutationError: (error) => {
      const status = getApiErrorStatus(error);
      if (status === 409) return t("noteConflict");
      return extra?.(status);
    },
  });
}

export function useCreateDeliveryNote() {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useNoteFeedback((status) =>
    status === 400 ? t("noteRejected") : undefined,
  );
  return useMutationFeedback({
    mutationFn: (input: DeliveryNoteInput) => createDeliveryNote(input),
    successMessage: t("noteCreated"),
    ...feedback,
    // The form names the refused cabinets itself, so no toast doubles it.
    isInlineFormError: (error) => refusedUnitCodes(error) !== null,
    onSettled: refresh,
  });
}

export function useShipDeliveryNote() {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useNoteFeedback();
  return useMutationFeedback({
    mutationFn: (id: number) => shipDeliveryNote(id),
    successMessage: t("noteShipped"),
    ...feedback,
    onSettled: refresh,
  });
}

export function useCancelDeliveryNote() {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useNoteFeedback();
  return useMutationFeedback({
    mutationFn: (input: { id: number; reason: string }) =>
      cancelDeliveryNote(input.id, input.reason),
    successMessage: t("noteCancelled"),
    ...feedback,
    onSettled: refresh,
  });
}

export function useReceiveDeliveryNote() {
  const t = useTranslations(TOAST);
  const refresh = useRefreshAfterChange();
  const feedback = useNoteFeedback((status) => {
    if (status === 400) return t("receiveRejected");
    if (status === 413) return t("fileTooLarge");
    return undefined;
  });
  return useMutationFeedback({
    mutationFn: (input: ReceiveInput & { id: number }) =>
      receiveDeliveryNote(input.id, input),
    successMessage: t("noteReceived"),
    ...feedback,
    onSettled: refresh,
  });
}
