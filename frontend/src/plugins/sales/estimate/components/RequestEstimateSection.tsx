"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { formatCurrency } from "@/kernel/core/lib/formatters";
import { Link, useRouter } from "@/kernel/i18n/navigation";

import {
  ESTIMATE_REQUEST_STARTABLE_STATUS,
  estimatePageRoutes,
} from "@plugins/sales/estimate/constants";
import {
  useCreateEstimate,
  useEstimateOfRequest,
} from "@plugins/sales/estimate/hooks/api/useEstimate";
import { EstimatePermission } from "@plugins/sales/estimate/permissions/estimate-permission.keys";
import { isEstimateWriter } from "@plugins/sales/estimate/utils/estimate-writer";

import { EstimateStatusBadge } from "./EstimateStatusBadge";

interface RequestEstimateSectionProps {
  requestId: number;
  /** Status of the request: an estimate can be started only on an assigned one. */
  requestStatus: string;
  /** The request's assigned engineer, who (with an engineering lead) may start the estimate. */
  assignedEngineerId?: number | null;
}

/**
 * The estimate of a request, on the request's own page: its code, revision, status and total
 * with a link to open it, or the button that starts it. A reader without `estimate:read`
 * gets nothing at all, not even a request for it.
 */
export function RequestEstimateSection(props: RequestEstimateSectionProps) {
  const { can } = useAuth();
  if (!can(EstimatePermission.read)) return null;
  return <EstimateSectionBody {...props} />;
}

/** The button follows the server rule: the permission AND being the assigned engineer or a lead. */
function EstimateSectionBody({
  requestId,
  requestStatus,
  assignedEngineerId,
}: RequestEstimateSectionProps) {
  const t = useTranslations("estimate");
  const router = useRouter();
  const { can, user } = useAuth();
  const canStart =
    can(EstimatePermission.create) &&
    isEstimateWriter(user, assignedEngineerId) &&
    requestStatus === ESTIMATE_REQUEST_STARTABLE_STATUS;

  const estimateQuery = useEstimateOfRequest(requestId);
  const create = useCreateEstimate();

  const estimate = estimateQuery.data;
  if (estimateQuery.isLoading) return null;

  return (
    <DetailSection title={t("title")}>
      {estimate ? (
        <DetailFieldGrid columns={2}>
          <DetailField
            label={t("code")}
            valueClassName="font-mono font-semibold"
          >
            <Link href={estimatePageRoutes.detail(estimate.id)}>
              {estimate.code}
            </Link>
          </DetailField>
          <DetailField label={t("status")}>
            <EstimateStatusBadge status={estimate.status} />
          </DetailField>
          <DetailField label={t("revision")}>
            {`#${estimate.latestRevision}`}
          </DetailField>
          <DetailField label={t("total")}>
            <span className="font-semibold tabular-nums">
              {formatCurrency(estimate.total)}
            </span>
          </DetailField>
        </DetailFieldGrid>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-secondary">{t("noneYet")}</p>
          {canStart ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-[7px] border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(requestId, {
                  onSuccess: (created) =>
                    router.push(estimatePageRoutes.detail(created.id)),
                })
              }
            >
              {t("create")}
            </button>
          ) : null}
        </div>
      )}
    </DetailSection>
  );
}
