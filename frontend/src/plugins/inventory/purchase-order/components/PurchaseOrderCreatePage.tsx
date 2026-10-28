"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { useRouter } from "@/kernel/i18n/navigation";

import { purchaseOrderPageRoutes } from "@plugins/inventory/purchase-order/constants";
import { useCreatePurchaseOrder } from "@plugins/inventory/purchase-order/hooks/api/usePurchaseOrder";
import { purchaseOrderFeature } from "@plugins/inventory/purchase-order/purchase-order.feature";

import { PurchaseOrderEditor } from "./PurchaseOrderEditor";

/** A new draft; saving it opens its page, where it is submitted. */
export function PurchaseOrderCreatePage() {
  const t = useTranslations("purchaseOrder");
  const router = useRouter();
  const create = useCreatePurchaseOrder();

  return (
    <DetailPageLayout
      pageTitle={t("title")}
      pageDescription={t("description")}
      breadcrumbs={[
        {
          label: t("title"),
          href: purchaseOrderPageRoutes.list,
          icon: purchaseOrderFeature.items[0]?.icon ?? "file-invoice",
        },
        { label: t("createTitle") },
      ]}
      title={t("createTitle")}
    >
      <PurchaseOrderEditor
        pending={create.isPending}
        onSave={(input) =>
          create.mutate(input, {
            onSuccess: (order) =>
              router.replace(purchaseOrderPageRoutes.detail(order.id)),
          })
        }
      />
    </DetailPageLayout>
  );
}
