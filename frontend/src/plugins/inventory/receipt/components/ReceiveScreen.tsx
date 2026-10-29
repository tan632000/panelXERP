"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { ScanInput } from "@/kernel/core/components/ui/ScanInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { formatNumber } from "@/kernel/core/lib/formatters";
import { generateClientUuid } from "@/kernel/core/lib/utils";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  PURCHASE_ORDER_RECEIVABLE,
  purchaseOrderPageRoutes,
} from "@plugins/inventory/purchase-order/constants";
import { usePurchaseOrder } from "@plugins/inventory/purchase-order/hooks/api/usePurchaseOrder";
import {
  RECEIPT_QUANTITY_DECIMALS,
  receiptPageRoutes,
} from "@plugins/inventory/receipt/constants";
import { useCreateReceipt } from "@plugins/inventory/receipt/hooks/api/useReceipt";
import { receiptFeature } from "@plugins/inventory/receipt/receipt.feature";
import { resolveScannedItemId } from "@plugins/inventory/receipt/services/receipt.service";
import {
  addOne,
  exceedsRemaining,
  lineForScan,
  receiptLines,
  remainingOf,
  ScanRefusedError,
  type ReceiveQuantities,
} from "@plugins/inventory/receipt/utils/receive-lines";

import type { PurchaseOrderLine } from "@plugins/inventory/purchase-order/types";

const PLAIN = { filterable: false, sortable: false } as const;

const quantityText = (value: number | string) => (
  <span className="tabular-nums">
    {formatNumber(Number(value), {
      maximumFractionDigits: RECEIPT_QUANTITY_DECIMALS,
    })}
  </span>
);

/**
 * Receives the goods of one approved purchase order. Each scan adds one to the first order line
 * of the scanned item that still has room; a quantity may also be typed. An item not on the
 * order, or with nothing left, is refused under the scan field, which keeps the focus. The post
 * carries one request key for the life of the screen, so a double submit posts once.
 */
export function ReceiveScreen() {
  const t = useTranslations("receipt");
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = Number(searchParams.get("purchaseOrderId"));
  const orderId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const query = usePurchaseOrder(orderId);
  const create = useCreateReceipt();

  const [quantities, setQuantities] = useState<ReceiveQuantities>({});
  const [requestKey] = useState(generateClientUuid);
  // The scan resolves after an await: it must read the quantities as they are then.
  const quantitiesRef = useRef(quantities);
  useEffect(() => {
    quantitiesRef.current = quantities;
  }, [quantities]);

  const order = query.data;
  const icon = receiptFeature.items[0]?.icon ?? "package-import";
  const listCrumb = { label: t("title"), href: receiptPageRoutes.list, icon };
  const header = { pageTitle: t("title"), pageDescription: t("description") };

  if (!order || !PURCHASE_ORDER_RECEIVABLE.includes(order.status)) {
    let body: React.ReactNode = <LoadingState variant="list" />;
    if (order) {
      body = (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("receive.notReceivable", { code: order.code })}
        />
      );
    } else if (!orderId || isNotFoundError(query.error) || query.isError) {
      body = (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("receive.orderNotFound")}
        />
      );
    }
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("receive.title") }]}
        title={t("receive.title")}
      >
        {body}
      </DetailPageLayout>
    );
  }

  const lines = order.lines;
  const over = lines.some((line) => exceedsRemaining(line, quantities));
  const payload = receiptLines(lines, quantities);

  const resolveScan = async (code: string) => {
    const itemId = await resolveScannedItemId(code);
    return lineForScan(lines, quantitiesRef.current, itemId);
  };
  const scanError = (error: unknown) => {
    if (error instanceof ScanRefusedError) return t(`scan.${error.refusal}`);
    return isNotFoundError(error) ? t("scan.notFound") : t("scan.failed");
  };

  const columns: Array<TableColumn<PurchaseOrderLine>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    { key: "itemUnit", ...PLAIN, header: t("lines.unit") },
    {
      key: "quantity",
      ...PLAIN,
      header: t("lines.ordered"),
      render: (_, row) => quantityText(row.quantity),
    },
    {
      key: "receivedQty",
      ...PLAIN,
      header: t("lines.received"),
      render: (_, row) => quantityText(row.receivedQty),
    },
    {
      key: "remaining",
      ...PLAIN,
      header: t("lines.remaining"),
      render: (_, row) => quantityText(remainingOf(row).toFixed()),
    },
    {
      key: "thisReceipt",
      ...PLAIN,
      header: t("lines.thisReceipt"),
      render: (_, row) => {
        const invalid = exceedsRemaining(row, quantities);
        return (
          <div className="flex min-w-[120px] flex-col">
            <NumberInput
              aria-label={t("lines.thisReceiptOf", { code: row.itemCode })}
              decimalScale={RECEIPT_QUANTITY_DECIMALS}
              value={quantities[row.id] ?? ""}
              error={invalid}
              disabled={create.isPending}
              onChange={(event) =>
                setQuantities((current) => ({
                  ...current,
                  [row.id]: event.target.value,
                }))
              }
            />
            {invalid ? (
              <p role="alert" className="mt-1 text-xs text-danger-text">
                {t("lines.overRemaining", {
                  remaining: formatNumber(remainingOf(row).toNumber(), {
                    maximumFractionDigits: RECEIPT_QUANTITY_DECIMALS,
                  }),
                })}
              </p>
            ) : null}
          </div>
        );
      },
    },
  ];

  const submit = () => {
    if (create.isPending || over || payload.length === 0) return;
    create.mutate(
      { purchaseOrderId: order.id, requestKey, lines: payload },
      { onSuccess: () => router.push(purchaseOrderPageRoutes.detail(order.id)) },
    );
  };

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: order.code }]}
      title={t("receive.titleOf", { code: order.code })}
      subtitle={`${order.supplierCode} — ${order.supplierName}`}
    >
      <DetailSection title={t("receive.scanTitle")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">{t("receive.hint")}</p>
          <ScanInput
            resolve={resolveScan}
            onResult={(lineId) =>
              setQuantities((current) => addOne(current, lineId))
            }
            errorMessage={scanError}
            placeholder={t("scan.placeholder")}
            disabled={create.isPending}
          />
        </div>
      </DetailSection>

      <DetailSection title={t("lines.title")}>
        <Table columns={columns} data={lines} rowKey={(row) => String(row.id)} />
      </DetailSection>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={create.isPending || over || payload.length === 0}
          onClick={submit}
        >
          {t("receive.submit")}
        </Button>
      </div>
    </DetailPageLayout>
  );
}
