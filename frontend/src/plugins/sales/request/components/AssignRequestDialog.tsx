"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { Modal } from "@/kernel/core/components/ui/Modal";

import {
  useAssignRequest,
  useEngineerOptions,
} from "@plugins/sales/request/hooks/api/useRequest";
import { resolveRequestToastKey } from "@plugins/sales/request/utils/map-request-api-errors";

interface AssignRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  /** The engineer the request has now, preselected when reassigning. */
  currentEngineerId?: number | null;
}

export function AssignRequestDialog({
  isOpen,
  onClose,
  requestId,
  currentEngineerId,
}: AssignRequestDialogProps) {
  const t = useTranslations("request");
  const tCommon = useTranslations("common");
  const optionsQuery = useEngineerOptions(isOpen);
  const assign = useAssignRequest();

  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resets the choice the moment the dialog opens or closes, without an effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setChoice(null);
    setError(null);
  }

  const value = choice ?? (currentEngineerId ? String(currentEngineerId) : "");
  const unchanged = value === String(currentEngineerId ?? "");

  const handleSubmit = async () => {
    if (!value) {
      setError(t("validation.engineerRequired"));
      return;
    }
    try {
      await assign.mutateAsync({
        id: requestId,
        data: { engineerId: Number(value) },
      });
      onClose();
    } catch (failure: unknown) {
      // The mutation toasts what a dialog cannot place; a rejected assignee belongs on the field.
      if (resolveRequestToastKey(failure) === "engineerInvalid") {
        setError(t("validation.engineerInvalid"));
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={currentEngineerId ? t("reassignTitle") : t("assignTitle")}
      submitLabel={t("assignSubmit")}
      cancelLabel={tCommon("cancel")}
      submitDisabled={assign.isPending || !value || unchanged}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <FormSelect
        label={t("assignedEngineer")}
        required
        options={(optionsQuery.data ?? []).map((option) => ({
          value: String(option.id),
          label: option.fullName,
        }))}
        value={value}
        onChange={(event) => {
          setChoice(event.target.value);
          setError(null);
        }}
        placeholder={t("placeholders.engineer")}
        error={error ?? undefined}
      />
    </Modal>
  );
}
