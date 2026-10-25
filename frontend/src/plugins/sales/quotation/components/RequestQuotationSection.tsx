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
  QUOTATION_REQUEST_STARTABLE_STATUS,
  quotationPageRoutes,
} from "@plugins/sales/quotation/constants";
import {
  useCreateQuotation,
  useQuotationOfRequest,
} from "@plugins/sales/quotation/hooks/api/useQuotation";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";

import { QuotationStatusBadge } from "./QuotationStatusBadge";

/** Request states in which the section has something to say about a quotation. */
const QUOTABLE_STATUSES: readonly string[] = [
  QUOTATION_REQUEST_STARTABLE_STATUS,
  "quoted",
];

interface RequestQuotationSectionProps {
  requestId: number;
  /** Status of the request: a quotation is started only on an estimated one. */
  requestStatus: string;
}

/**
 * The quotation of a request, on the request's own page: its code, version, status and total
 * with a link to open it, or the button that starts it on an estimated request. A reader
 * without `quotation:read` gets nothing at all, not even a request for it.
 */
export function RequestQuotationSection(props: RequestQuotationSectionProps) {
  const { can } = useAuth();
  if (!can(QuotationPermission.read)) return null;
  return <QuotationSectionBody {...props} />;
}

function QuotationSectionBody({
  requestId,
  requestStatus,
}: RequestQuotationSectionProps) {
  const t = useTranslations("quotation");
  const router = useRouter();
  const { can } = useAuth();
  const canStart =
    can(QuotationPermission.create) &&
    requestStatus === QUOTATION_REQUEST_STARTABLE_STATUS;

  const quotationQuery = useQuotationOfRequest(requestId);
  const create = useCreateQuotation();

  const quotation = quotationQuery.data;
  if (quotationQuery.isLoading) return null;
  // Nothing to show or start: the request is not estimated yet and no quotation exists.
  if (!quotation && !QUOTABLE_STATUSES.includes(requestStatus)) return null;

  return (
    <DetailSection title={t("title")}>
      {quotation ? (
        <DetailFieldGrid columns={2}>
          <DetailField
            label={t("code")}
            valueClassName="font-mono font-semibold"
          >
            <Link href={quotationPageRoutes.detail(quotation.id)}>
              {quotation.code}
            </Link>
          </DetailField>
          <DetailField label={t("status")}>
            {quotation.latest ? (
              <QuotationStatusBadge status={quotation.latest.status} />
            ) : (
              t("emptyValue")
            )}
          </DetailField>
          <DetailField label={t("version")}>
            {`v${quotation.latestVer}`}
          </DetailField>
          <DetailField label={t("total")}>
            <span className="font-semibold tabular-nums">
              {formatCurrency(quotation.latest?.total)}
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
                create.mutate(
                  { requestId },
                  {
                    onSuccess: (created) =>
                      router.push(quotationPageRoutes.detail(created.id)),
                  },
                )
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
