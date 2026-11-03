"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { formatNumber } from "@/kernel/core/lib/formatters";
import { generateClientUuid } from "@/kernel/core/lib/utils";
import { useRouter } from "@/kernel/i18n/navigation";

import { isReturnableOrder } from "@plugins/inventory/_shared/order-status-gates";
import {
  ISSUE_QUANTITY_DECIMALS,
  issuePageRoutes,
} from "@plugins/inventory/issue/constants";
import { useCreateWorkshopReturn } from "@plugins/inventory/issue/hooks/api/useIssue";
import { issueFeature } from "@plugins/inventory/issue/issue.feature";
import {
  outAtWorkshop,
  quantityOf,
} from "@plugins/inventory/issue/utils/issue-lines";
import { materialPageRoutes } from "@plugins/inventory/material/constants";
import { useOrderMaterial } from "@plugins/inventory/material/hooks/api/useMaterial";

import type { MaterialItemRow } from "@plugins/inventory/material/types";

const PLAIN = { filterable: false, sortable: false } as const;

const quantityText = (value: number) => (
  <span className="tabular-nums">
    {formatNumber(value, { maximumFractionDigits: ISSUE_QUANTITY_DECIMALS })}
  </span>
);

/**
 * Takes back what the workshop did not use from one open, in-production or cancelled order: per item what is
 * still out, never more. The post carries one request key for the life of the screen.
 */
export function WorkshopReturnScreen() {
  const t = useTranslations("issue");
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = Number(searchParams.get("orderId"));
  const orderId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const query = useOrderMaterial(orderId);
  const create = useCreateWorkshopReturn();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [requestKey] = useState(generateClientUuid);

  const detail = query.data;
  const icon = issueFeature.items[0]?.icon ?? "package-export";
  const listCrumb = { label: t("title"), href: issuePageRoutes.list, icon };
  const header = { pageTitle: t("title"), pageDescription: t("description") };

  if (!detail || !isReturnableOrder(detail.order.status)) {
    let body: React.ReactNode = <LoadingState variant="list" />;
    if (detail) {
      body = (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("returnScreen.notReturnable", { code: detail.order.code })}
        />
      );
    } else if (!orderId || isNotFoundError(query.error) || query.isError) {
      body = (
        <EmptyState bordered={false} icon={icon} message={t("orderNotFound")} />
      );
    }
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("returnScreen.title") }]}
        title={t("returnScreen.title")}
      >
        {body}
      </DetailPageLayout>
    );
  }

  const outItems = detail.items.filter((item) =>
    outAtWorkshop(item).greaterThan(0),
  );
  const tooMany = (item: MaterialItemRow) =>
    quantityOf(quantities[item.itemId]).greaterThan(outAtWorkshop(item));
  const payload = outItems
    .filter((item) => quantityOf(quantities[item.itemId]).greaterThan(0))
    .map((item) => ({
      itemId: item.itemId,
      quantity: quantityOf(quantities[item.itemId]).toNumber(),
    }));
  const blocked =
    create.isPending || payload.length === 0 || outItems.some(tooMany);

  const columns: Array<TableColumn<MaterialItemRow>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    { key: "itemUnit", ...PLAIN, header: t("lines.unit") },
    {
      key: "issued",
      ...PLAIN,
      header: t("lines.out"),
      render: (_, row) => quantityText(outAtWorkshop(row).toNumber()),
    },
    {
      key: "returning",
      ...PLAIN,
      header: t("lines.returning"),
      render: (_, row) => (
        <div className="flex min-w-[120px] flex-col">
          <NumberInput
            aria-label={t("lines.quantityOf", { code: row.itemCode })}
            decimalScale={ISSUE_QUANTITY_DECIMALS}
            value={quantities[row.itemId] ?? ""}
            error={tooMany(row)}
            disabled={create.isPending}
            onChange={(event) =>
              setQuantities((current) => ({
                ...current,
                [row.itemId]: event.target.value,
              }))
            }
          />
          {tooMany(row) ? (
            <p role="alert" className="mt-1 text-xs text-danger-text">
              {t("lines.overOut")}
            </p>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: detail.order.code }]}
      title={t("returnScreen.titleOf", { code: detail.order.code })}
      subtitle={detail.order.customerName}
    >
      <DetailSection title={t("returnScreen.itemsTitle")}>
        {outItems.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t("returnScreen.nothingOut")}
          </p>
        ) : (
          <Table
            columns={columns}
            data={outItems}
            rowKey={(row) => String(row.itemId)}
          />
        )}
      </DetailSection>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={blocked}
          onClick={() => {
            if (blocked) return;
            create.mutate(
              { orderId: detail.order.id, requestKey, lines: payload },
              {
                onSuccess: () =>
                  router.push(materialPageRoutes.order(detail.order.id)),
              },
            );
          }}
        >
          {t("returnScreen.submit")}
        </Button>
      </div>
    </DetailPageLayout>
  );
}
