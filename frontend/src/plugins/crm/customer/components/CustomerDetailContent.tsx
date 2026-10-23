"use client";

import { useLocale, useTranslations } from "next-intl";
import React from "react";

import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailNoteBox } from "@/kernel/core/components/ui/DetailNoteBox";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { displayDetailValue } from "@/kernel/core/lib/display-detail-value";
import { formatDate } from "@/kernel/core/lib/formatters";

import { ContactSection } from "@plugins/crm/contact/components/ContactSection";

import type { Customer } from "@plugins/crm/customer/types";

interface CustomerDetailContentProps {
  customer: Customer;
}

export function CustomerDetailContent({
  customer,
}: Readonly<CustomerDetailContentProps>) {
  const t = useTranslations("customer");
  const locale = useLocale();

  const empty = t("emptyValue");
  const displayValue = (value?: string | null) =>
    displayDetailValue(value, empty);
  const noteDisplay = customer.note?.trim() ? customer.note : t("emptyNote");

  return (
    <>
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("code")} valueClassName="font-mono font-semibold">
            {customer.code}
          </DetailField>
          <DetailField label={t("createdDate")}>
            {formatDate(customer.createdAt, locale)}
          </DetailField>
          <DetailField label={t("name")}>{customer.name}</DetailField>
          <DetailField label={t("salesOwner")}>
            {displayValue(customer.salesOwnerName)}
          </DetailField>
          <DetailField label={t("taxCode")}>
            {displayValue(customer.taxCode)}
          </DetailField>
          <DetailField label={t("phone")}>
            {displayValue(customer.phone)}
          </DetailField>
          <DetailField label={t("email")}>
            {displayValue(customer.email)}
          </DetailField>
          <DetailField label={t("address")} spanFull>
            {displayValue(customer.address)}
          </DetailField>
        </DetailFieldGrid>
      </DetailSection>

      <DetailSection title={t("note")}>
        <DetailNoteBox>{noteDisplay}</DetailNoteBox>
      </DetailSection>

      <ContactSection customerId={customer.id} />
    </>
  );
}
