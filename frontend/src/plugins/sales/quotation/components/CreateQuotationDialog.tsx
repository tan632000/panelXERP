"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  QUOTATION_REQUEST_STARTABLE_STATUS,
  quotationPageRoutes,
} from "@plugins/sales/quotation/constants";
import { useCreateQuotation } from "@plugins/sales/quotation/hooks/api/useQuotation";
import { requestQueryKeys } from "@plugins/sales/request/constants";
import { getRequests } from "@plugins/sales/request/services/request.service";

interface CreateQuotationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The estimated requests offered at once; a Sales actor's own are few. */
const REQUEST_OPTIONS_LIMIT = 100;

/**
 * Starts a quotation from the list: the estimated requests the actor can see are offered, and
 * the new quotation opens when it is created. The request page offers the same for one request.
 */
export function CreateQuotationDialog({
  isOpen,
  onClose,
}: CreateQuotationDialogProps) {
  const t = useTranslations("quotation");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const create = useCreateQuotation();

  const optionsQuery = useQuery({
    queryKey: requestQueryKeys.list({
      picker: "quotable",
      status: QUOTATION_REQUEST_STARTABLE_STATUS,
    }),
    queryFn: () =>
      getRequests({
        status: QUOTATION_REQUEST_STARTABLE_STATUS,
        limit: REQUEST_OPTIONS_LIMIT,
      }),
    enabled: isOpen,
  });

  const [choice, setChoice] = useState("");
  // Resets the choice the moment the dialog opens or closes, without an effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setChoice("");
  }

  const options = (optionsQuery.data?.data ?? []).map((request) => ({
    value: String(request.id),
    label: `${request.code} — ${request.title}`,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("createTitle")}
      submitLabel={t("create")}
      cancelLabel={tCommon("cancel")}
      submitDisabled={create.isPending || !choice}
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          { requestId: Number(choice) },
          {
            onSuccess: (created) => {
              onClose();
              router.push(quotationPageRoutes.detail(created.id));
            },
          },
        );
      }}
    >
      <FormSelect
        label={t("createRequest")}
        required
        options={options}
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        placeholder={
          optionsQuery.isSuccess && options.length === 0
            ? t("noEstimatedRequests")
            : t("createRequestPlaceholder")
        }
      />
    </Modal>
  );
}
