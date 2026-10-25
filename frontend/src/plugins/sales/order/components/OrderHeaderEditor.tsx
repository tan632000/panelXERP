"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";

import { useUpdateOrder } from "@plugins/sales/order/hooks/api/useOrder";

import {
  OrderContractFields,
  toOrderHeaderDto,
  type ContractFieldValues,
} from "./OrderContractFields";

import type { OrderDetail } from "@plugins/sales/order/types";

interface OrderHeaderEditorProps {
  order: OrderDetail;
  /** False once the order is no longer open, or for a reader without `order:update`. */
  editable: boolean;
}

/**
 * Contract number, contract date and delivery date. Read-only unless the order is open and the
 * reader may update it; the lines, prices, totals and snapshots have no editor at all.
 */
export function OrderHeaderEditor({ order, editable }: OrderHeaderEditorProps) {
  const t = useTranslations("order");
  const save = useUpdateOrder(order.id);

  const saved: ContractFieldValues = {
    contractNo: order.contractNo ?? "",
    contractDate: order.contractDate ?? "",
    deliveryDate: order.deliveryDate ?? "",
  };
  const [values, setValues] = useState(saved);
  const dirty =
    values.contractNo.trim() !== saved.contractNo ||
    values.contractDate !== saved.contractDate ||
    values.deliveryDate !== saved.deliveryDate;

  return (
    <DetailSection title={t("contract.title")}>
      <OrderContractFields
        values={values}
        onChange={setValues}
        disabled={!editable || save.isPending}
      />
      {editable ? (
        <div className="mt-3 flex justify-end">
          <DetailPanelActionButton
            variant="primary"
            icon="check"
            label={t("contract.save")}
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(toOrderHeaderDto(values))}
          />
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">
          {t("contract.readOnly")}
        </p>
      )}
    </DetailSection>
  );
}
