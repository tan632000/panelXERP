"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { ScanInput } from "@/kernel/core/components/ui/ScanInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { formatNumber } from "@/kernel/core/lib/formatters";
import { generateClientUuid } from "@/kernel/core/lib/utils";
import { useRouter } from "@/kernel/i18n/navigation";

import { purchaseOrderPageRoutes } from "@plugins/inventory/purchase-order/constants";
import { usePurchaseOrder } from "@plugins/inventory/purchase-order/hooks/api/usePurchaseOrder";
import {
  SUPPLIER_RETURN_QUANTITY_DECIMALS,
  SUPPLIER_RETURN_REASON_MAX,
  SUPPLIER_RETURNABLE_STATUSES,
} from "@plugins/inventory/supplier-return/constants";
import { useCreateSupplierReturn } from "@plugins/inventory/supplier-return/hooks/api/useSupplierReturn";
import { resolveScannedItemId } from "@plugins/inventory/supplier-return/services/supplier-return.service";
import {
  addOne,
  exceedsReceived,
  lineForReturnScan,
  ReturnScanRefusedError,
  returnLines,
  type ReturnQuantities,
} from "@plugins/inventory/supplier-return/utils/return-lines";

import type { PurchaseOrderLine } from "@plugins/inventory/purchase-order/types";

const PLAIN = { filterable: false, sortable: false } as const;
const RETURNABLE: readonly string[] = SUPPLIER_RETURNABLE_STATUSES;

const quantityText = (value: number) => (
  <span className="tabular-nums">
    {formatNumber(value, {
      maximumFractionDigits: SUPPLIER_RETURN_QUANTITY_DECIMALS,
    })}
  </span>
);

/**
 * Sends received goods back to the supplier of one purchase order. Each scan adds one to the
 * first line of the item with something received left; a quantity may be typed. Never more
 * than a line received, and a reason is required. The post carries one request key for the
 * life of the screen, so a double submit posts once.
 */
export function SupplierReturnForm() {
  const t = useTranslations("supplierReturn");
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = Number(searchParams.get("purchaseOrderId"));
  const orderId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const query = usePurchaseOrder(orderId);
  const create = useCreateSupplierReturn();

  const [quantities, setQuantities] = useState<ReturnQuantities>({});
  const [reason, setReason] = useState("");
  const [requestKey] = useState(generateClientUuid);
  // The scan resolves after an await: it must read the quantities as they are then.
  const quantitiesRef = useRef(quantities);
  useEffect(() => {
    quantitiesRef.current = quantities;
  }, [quantities]);

  const order = query.data;
  const header = { pageTitle: t("title"), pageDescription: t("description") };

  if (!order || !RETURNABLE.includes(order.status)) {
    let body: React.ReactNode = <LoadingState variant="list" />;
    if (order) {
      body = (
        <EmptyState
          bordered={false}
          icon="package-export"
          message={t("notReturnable", { code: order.code })}
        />
      );
    } else if (!orderId || isNotFoundError(query.error) || query.isError) {
      body = (
        <EmptyState
          bordered={false}
          icon="package-export"
          message={t("orderNotFound")}
        />
      );
    }
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[{ label: t("title") }]}
        title={t("title")}
      >
        {body}
      </DetailPageLayout>
    );
  }

  const lines = order.lines.filter((line) => line.receivedQty > 0);
  const over = lines.some((line) => exceedsReceived(line, quantities));
  const payload = returnLines(lines, quantities);
  const blocked =
    create.isPending || over || payload.length === 0 || reason.trim() === "";

  const resolveScan = async (code: string) => {
    const itemId = await resolveScannedItemId(code);
    return lineForReturnScan(lines, quantitiesRef.current, itemId);
  };
  const scanError = (error: unknown) => {
    if (error instanceof ReturnScanRefusedError) return t(`scan.${error.refusal}`);
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
      key: "receivedQty",
      ...PLAIN,
      header: t("lines.received"),
      render: (_, row) => quantityText(row.receivedQty),
    },
    {
      key: "returning",
      ...PLAIN,
      header: t("lines.returning"),
      render: (_, row) => (
        <div className="flex min-w-[120px] flex-col">
          <NumberInput
            aria-label={t("lines.returningOf", { code: row.itemCode })}
            decimalScale={SUPPLIER_RETURN_QUANTITY_DECIMALS}
            value={quantities[row.id] ?? ""}
            error={exceedsReceived(row, quantities)}
            disabled={create.isPending}
            onChange={(event) =>
              setQuantities((current) => ({
                ...current,
                [row.id]: event.target.value,
              }))
            }
          />
          {exceedsReceived(row, quantities) ? (
            <p role="alert" className="mt-1 text-xs text-danger-text">
              {t("lines.overReceived")}
            </p>
          ) : null}
        </div>
      ),
    },
  ];

  const submit = () => {
    if (blocked) return;
    create.mutate(
      {
        purchaseOrderId: order.id,
        requestKey,
        reason: reason.trim(),
        lines: payload,
      },
      {
        onSuccess: () => router.push(purchaseOrderPageRoutes.detail(order.id)),
      },
    );
  };

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[
        { label: order.code, href: purchaseOrderPageRoutes.detail(order.id) },
        { label: t("title") },
      ]}
      title={t("titleOf", { code: order.code })}
      subtitle={`${order.supplierCode} — ${order.supplierName}`}
    >
      <DetailSection title={t("scanTitle")}>
        <ScanInput
          resolve={resolveScan}
          onResult={(lineId) =>
            setQuantities((current) => addOne(current, lineId))
          }
          errorMessage={scanError}
          placeholder={t("scan.placeholder")}
          disabled={create.isPending}
        />
      </DetailSection>

      <DetailSection title={t("lines.title")}>
        {lines.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("nothingReceived")}</p>
        ) : (
          <Table columns={columns} data={lines} rowKey={(row) => String(row.id)} />
        )}
      </DetailSection>

      <DetailSection title={t("reason")}>
        <FormInput
          label={t("reason")}
          aria-label={t("reason")}
          labelHidden
          required
          maxLength={SUPPLIER_RETURN_REASON_MAX}
          value={reason}
          disabled={create.isPending}
          onChange={(event) => setReason(event.target.value)}
        />
      </DetailSection>

      <div className="flex justify-end">
        <Button type="button" disabled={blocked} onClick={submit}>
          {t("submit")}
        </Button>
      </div>
    </DetailPageLayout>
  );
}
