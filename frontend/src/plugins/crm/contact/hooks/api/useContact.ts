"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { contactQueryKeys } from "@plugins/crm/contact/constants";
import {
  createContact,
  deleteContact,
  getCustomerContacts,
  updateContact,
} from "@plugins/crm/contact/services/contact.service";

import type {
  CreateContactDto,
  UpdateContactDto,
} from "@plugins/crm/contact/types";

export function useCustomerContacts(customerId: number, enabled = true) {
  return useQuery({
    queryKey: contactQueryKeys.list(customerId),
    queryFn: () => getCustomerContacts(customerId),
    enabled: enabled && customerId > 0,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCreateContact() {
  const t = useTranslations("contact.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("contact.toast");
  return useMutationFeedback({
    mutationFn: (input: CreateContactDto) => createContact(input),
    successMessage: t("createContactSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactQueryKeys.all });
    },
  });
}

export function useUpdateContact() {
  const t = useTranslations("contact.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("contact.toast");
  return useMutationFeedback({
    mutationFn: ({ id, data }: { id: number; data: UpdateContactDto }) =>
      updateContact(id, data),
    successMessage: t("updateContactSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactQueryKeys.all });
    },
  });
}

export function useDeleteContact() {
  const t = useTranslations("contact.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("contact.toast");
  return useMutationFeedback({
    mutationFn: (id: number) => deleteContact(id),
    successMessage: t("deleteContactSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactQueryKeys.all });
    },
  });
}
