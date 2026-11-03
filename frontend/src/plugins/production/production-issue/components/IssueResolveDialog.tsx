"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";

import { ISSUE_TEXT_MAX } from "@plugins/production/production-issue/constants";
import { useResolveIssue } from "@plugins/production/production-issue/hooks/api/useProductionIssue";

import type { ProductionIssue } from "@plugins/production/production-issue/types";

interface Props {
  issue: ProductionIssue | null;
  onClose: () => void;
}

/** Closes an issue with the resolution that is kept beside it. */
export function IssueResolveDialog({ issue, onClose }: Readonly<Props>) {
  const t = useTranslations("production");
  const resolve = useResolveIssue();

  return (
    <CancelReasonModal
      isOpen={issue !== null}
      title={t("issues.resolve.title", { code: issue?.unitCode ?? "" })}
      description={issue?.description}
      submitLabel={t("issues.resolve.submit")}
      pending={resolve.isPending}
      onClose={onClose}
      onConfirm={(resolution) => {
        if (!issue) return;
        resolve.mutate({ id: issue.id, resolution }, { onSuccess: onClose });
      }}
      reasonLabel={t("issues.resolve.resolution")}
      placeholder={t("issues.resolve.placeholder")}
      requiredMessage={t("issues.resolve.required")}
      maxLengthMessage={t("issues.resolve.max", { max: ISSUE_TEXT_MAX })}
      maxLength={ISSUE_TEXT_MAX}
    />
  );
}
