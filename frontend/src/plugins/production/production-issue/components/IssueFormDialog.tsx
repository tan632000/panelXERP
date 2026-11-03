"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { Modal } from "@/kernel/core/components/ui/Modal";

import {
  ISSUE_SEVERITIES,
  ISSUE_TEXT_MAX,
  type IssueSeverity,
} from "@plugins/production/production-issue/constants";
import { useOpenIssue } from "@plugins/production/production-issue/hooks/api/useProductionIssue";
import {
  PRODUCTION_STAGES,
  type ProductionStage,
} from "@plugins/production/progress/constants";

interface Props {
  isOpen: boolean;
  unit: { id: number; code: string };
  /** The stage the form starts on, usually the cabinet's current one. */
  defaultStage: ProductionStage;
  onClose: () => void;
}

/** Reports a problem on one stage of a cabinet. */
export function IssueFormDialog({
  isOpen,
  unit,
  defaultStage,
  onClose,
}: Readonly<Props>) {
  const t = useTranslations("production");
  const [stage, setStage] = useState<ProductionStage>(defaultStage);
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [description, setDescription] = useState("");
  const open = useOpenIssue(unit.id);

  const close = () => {
    setDescription("");
    setSeverity("medium");
    setStage(defaultStage);
    onClose();
  };
  const text = description.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={t("issues.form.title", { code: unit.code })}
      submitLabel={t("issues.form.submit")}
      submitDisabled={text === "" || open.isPending}
      onSubmit={() =>
        open.mutate(
          { stage, severity, description: text },
          { onSuccess: close },
        )
      }
    >
      <div className="flex flex-col gap-3">
        <FormSelect
          label={t("issues.stage")}
          searchable={false}
          value={stage}
          options={PRODUCTION_STAGES.map((value) => ({
            value,
            label: t(`stages.${value}`),
          }))}
          onChange={(event) => setStage(event.target.value as ProductionStage)}
        />
        <FormSelect
          label={t("issues.severity")}
          searchable={false}
          value={severity}
          options={ISSUE_SEVERITIES.map((value) => ({
            value,
            label: t(`issues.severities.${value}`),
          }))}
          onChange={(event) => setSeverity(event.target.value as IssueSeverity)}
        />
        <FormTextArea
          label={t("issues.description")}
          required
          maxLength={ISSUE_TEXT_MAX}
          placeholder={t("issues.form.placeholder")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </Modal>
  );
}
