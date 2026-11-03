"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Modal } from "@/kernel/core/components/ui/Modal";
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import { useRouter } from "@/kernel/i18n/navigation";

import { productionOrderPageRoutes } from "@plugins/production/production-order/constants";
import {
  useCreateProductionOrder,
  useOpenOrders,
} from "@plugins/production/production-order/hooks/api/useProductionOrder";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Picks one of the open orders that has no production order yet and drafts one for it. */
export function ProductionOrderCreateDialog({ isOpen, onClose }: Props) {
  const t = useTranslations("production");
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const options = useOpenOrders(isOpen);
  const create = useCreateProductionOrder();

  const close = () => {
    setOrderId("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={t("create.title")}
      submitLabel={t("create.submit")}
      submitDisabled={orderId === "" || create.isPending}
      onSubmit={() =>
        create.mutate(Number(orderId), {
          onSuccess: (detail) => {
            close();
            router.push(productionOrderPageRoutes.detail(detail.id));
          },
        })
      }
    >
      <label className="flex flex-col gap-1 text-sm">
        {t("create.order")}
        <select
          aria-label={t("create.order")}
          className="h-9 rounded-[7px] border border-border-secondary bg-surface-primary px-2 text-sm"
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
        >
          <option value="">{t("create.pickOrder")}</option>
          {(options.data ?? []).map((order) => (
            <option key={order.id} value={order.id}>
              {order.deliveryDate
                ? `${order.code} — ${order.customerName} (${formatIsoDate(order.deliveryDate)})`
                : `${order.code} — ${order.customerName}`}
            </option>
          ))}
        </select>
      </label>
      {options.data && options.data.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">
          {t("create.noOpenOrders")}
        </p>
      ) : null}
    </Modal>
  );
}
