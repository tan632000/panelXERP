"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailNoteBox } from "@/kernel/core/components/ui/DetailNoteBox";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { displayDetailValue } from "@/kernel/core/lib/display-detail-value";
import { formatIsoDate } from "@/kernel/core/lib/formatters";

import { RequestEstimateSection } from "@plugins/sales/estimate/components/RequestEstimateSection";

import { RequestAttachments } from "./RequestAttachments";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { RequestTimeline } from "./RequestTimeline";

import type { RequestDetail } from "@plugins/sales/request/types";

export function RequestDetailContent({
  request,
}: Readonly<{ request: RequestDetail }>) {
  const t = useTranslations("request");

  const empty = t("emptyValue");
  const value = (text?: string | null) => displayDetailValue(text, empty);
  const date = (iso?: string | null) => (iso ? formatIsoDate(iso) : empty);
  const closeReasons: Partial<Record<string, string | null | undefined>> = {
    cancelled: request.cancelReason,
    lost: request.lostReason,
  };
  const closeReason = closeReasons[request.status];

  return (
    <>
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField
            label={t("code")}
            valueClassName="font-mono font-semibold"
          >
            {request.code}
          </DetailField>
          <DetailField label={t("status")}>
            <RequestStatusBadge status={request.status} />
          </DetailField>
          <DetailField label={t("titleField")} spanFull>
            {request.title}
          </DetailField>
          <DetailField label={t("salesOwner")}>
            {value(request.salesOwnerName)}
          </DetailField>
          <DetailField label={t("assignedEngineer")}>
            {value(request.assignedEngineerName)}
          </DetailField>
          <DetailField label={t("requestedDeliveryDate")}>
            {date(request.requestedDeliveryDate)}
          </DetailField>
          <DetailField label={t("quotationDueDate")}>
            {date(request.quotationDueDate)}
          </DetailField>
          {closeReason ? (
            <DetailField
              label={
                request.status === "cancelled"
                  ? t("cancelReason")
                  : t("lostReason")
              }
              spanFull
            >
              {closeReason}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
      </DetailSection>

      <DetailSection title={t("customerInfo")}>
        {request.customer ? (
          <DetailFieldGrid columns={2}>
            <DetailField label={t("customerCode")}>
              {request.customer.code}
            </DetailField>
            <DetailField label={t("customerName")}>
              {request.customer.name}
            </DetailField>
            <DetailField label={t("taxCode")}>
              {value(request.customer.taxCode)}
            </DetailField>
            <DetailField label={t("address")}>
              {value(request.customer.address)}
            </DetailField>
          </DetailFieldGrid>
        ) : (
          <p className="text-sm text-text-secondary">{empty}</p>
        )}
      </DetailSection>

      <DetailSection title={t("projectInfo")}>
        {request.project ? (
          <DetailFieldGrid columns={2}>
            <DetailField label={t("projectCode")}>
              {request.project.code}
            </DetailField>
            <DetailField label={t("projectName")}>
              {request.project.name}
            </DetailField>
            <DetailField label={t("siteAddress")} spanFull>
              {value(request.project.siteAddress)}
            </DetailField>
          </DetailFieldGrid>
        ) : (
          <p className="text-sm text-text-secondary">{t("noProject")}</p>
        )}
      </DetailSection>

      <DetailSection title={t("contactInfo")}>
        {request.contact ? (
          <DetailFieldGrid columns={2}>
            <DetailField label={t("contactName")}>
              {request.contact.name}
            </DetailField>
            <DetailField label={t("contactPosition")}>
              {value(request.contact.position)}
            </DetailField>
            <DetailField label={t("contactPhone")}>
              {value(request.contact.phone)}
            </DetailField>
            <DetailField label={t("contactEmail")}>
              {value(request.contact.email)}
            </DetailField>
          </DetailFieldGrid>
        ) : (
          <p className="text-sm text-text-secondary">{t("noContact")}</p>
        )}
      </DetailSection>

      <DetailSection title={t("technicalRequirements")}>
        <DetailNoteBox>
          {request.technicalRequirements?.trim()
            ? request.technicalRequirements
            : t("noRequirements")}
        </DetailNoteBox>
      </DetailSection>

      <RequestEstimateSection
        requestId={request.id}
        requestStatus={request.status}
        assignedEngineerId={request.assignedEngineerId}
      />

      <RequestAttachments requestId={request.id} status={request.status} />

      <RequestTimeline requestId={request.id} />
    </>
  );
}
