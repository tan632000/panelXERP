"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { formatCurrency } from "@/kernel/core/lib/formatters";
import { Link, useRouter } from "@/kernel/i18n/navigation";

import { orderPageRoutes } from "@plugins/sales/order/constants";
import {
  useCreateOrder,
  useOrderOfQuotation,
} from "@plugins/sales/order/hooks/api/useOrder";
import { OrderPermission } from "@plugins/sales/order/permissions/order.permissions";

import {
  EMPTY_CONTRACT_FIELDS,
  OrderContractFields,
  toOrderHeaderDto,
  type ContractFieldValues,
} from "./OrderContractFields";
import { OrderStatusBadge } from "./OrderStatusBadge";

interface QuotationOrderSectionProps {
  quotationId: number;
  /** Status of the newest version: only a customer-confirmed one becomes an order. */
  versionStatus: string;
  /** False while an older version is pinned for reading. */
  isLatest: boolean;
}

/**
 * The order of a quotation, on the quotation's own page: its code and status with a link, or
 * the action that converts the customer-confirmed version into it. A reader without
 * `order:read` gets nothing at all, not even a request for it.
 */
export function QuotationOrderSection(props: QuotationOrderSectionProps) {
  const { can } = useAuth();
  if (!can(OrderPermission.read) || !props.isLatest) return null;
  return <OrderSectionBody {...props} />;
}

function OrderSectionBody({
  quotationId,
  versionStatus,
}: QuotationOrderSectionProps) {
  const t = useTranslations("order");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { can } = useAuth();
  const [converting, setConverting] = useState(false);
  const [fields, setFields] = useState<ContractFieldValues>(
    EMPTY_CONTRACT_FIELDS,
  );

  const orderQuery = useOrderOfQuotation(quotationId);
  const create = useCreateOrder();

  const order = orderQuery.data;
  if (orderQuery.isLoading) return null;
  const confirmed = versionStatus === "customer_confirmed";
  // Nothing to show or start until the customer confirmed and no order exists.
  if (!order && !confirmed) return null;

  const canConvert = !order && confirmed && can(OrderPermission.create);

  return (
    <DetailSection title={t("fromQuotation.title")}>
      {order ? (
        <DetailFieldGrid columns={2}>
          <DetailField
            label={t("code")}
            valueClassName="font-mono font-semibold"
          >
            <Link href={orderPageRoutes.detail(order.id)}>{order.code}</Link>
          </DetailField>
          <DetailField label={t("status")}>
            <OrderStatusBadge status={order.status} />
          </DetailField>
          <DetailField label={t("total")}>
            <span className="font-semibold tabular-nums">
              {formatCurrency(order.total)}
            </span>
          </DetailField>
        </DetailFieldGrid>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-secondary">
            {t("fromQuotation.none")}
          </p>
          {canConvert ? (
            <DetailPanelActionButton
              variant="primary"
              icon="file-check"
              label={t("fromQuotation.convert")}
              disabled={create.isPending}
              onClick={() => setConverting(true)}
            />
          ) : null}
        </div>
      )}

      <Modal
        isOpen={converting}
        onClose={() => setConverting(false)}
        title={t("fromQuotation.convertTitle")}
        submitLabel={t("fromQuotation.convert")}
        cancelLabel={tCommon("cancel")}
        submitDisabled={create.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(
            { quotationId, ...toOrderHeaderDto(fields) },
            {
              onSuccess: (created) => {
                setConverting(false);
                router.push(orderPageRoutes.detail(created.id));
              },
            },
          );
        }}
      >
        <p className="mb-3 text-sm text-text-secondary">
          {t("fromQuotation.convertHint")}
        </p>
        <OrderContractFields values={fields} onChange={setFields} />
      </Modal>
    </DetailSection>
  );
}
