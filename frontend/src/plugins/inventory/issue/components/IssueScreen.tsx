"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

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
import { cn } from "@/kernel/core/lib/cn";
import { formatNumber } from "@/kernel/core/lib/formatters";
import { generateClientUuid } from "@/kernel/core/lib/utils";
import { useRouter } from "@/kernel/i18n/navigation";

import { isIssuableOrder } from "@plugins/inventory/_shared/order-status-gates";
import {
  ISSUE_QUANTITY_DECIMALS,
  ISSUE_REASON_MAX,
  issuePageRoutes,
} from "@plugins/inventory/issue/constants";
import { useCreateIssue } from "@plugins/inventory/issue/hooks/api/useIssue";
import { issueFeature } from "@plugins/inventory/issue/issue.feature";
import { resolveScannedItem } from "@plugins/inventory/issue/services/issue.service";
import {
  addScanned,
  needsReason,
  outAtWorkshop,
  overBomItemIds,
  quantityOf,
  type IssueDraftLine,
} from "@plugins/inventory/issue/utils/issue-lines";
import { materialPageRoutes } from "@plugins/inventory/material/constants";
import { useOrderMaterial } from "@plugins/inventory/material/hooks/api/useMaterial";

import type {
  MaterialItemRow,
  MaterialPanel,
} from "@plugins/inventory/material/types";

type PanelBomLine = MaterialPanel["bomLines"][number];

const PLAIN = { filterable: false, sortable: false } as const;

const quantityText = (value: number) => (
  <span className="tabular-nums">
    {formatNumber(value, { maximumFractionDigits: ISSUE_QUANTITY_DECIMALS })}
  </span>
);

/**
 * Issues materials to one open order. The order's items show what it needs, holds, has out and
 * still lacks; each scan adds one of the item to the selected panel's line, or to a line
 * outside the BOM. Once the order goes beyond its BOM for an item, every line of that item
 * needs a reason. The post carries one request key for the life of the screen.
 */
export function IssueScreen() {
  const t = useTranslations("issue");
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = Number(searchParams.get("orderId"));
  const orderId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const query = useOrderMaterial(orderId);
  const create = useCreateIssue();

  const [panelId, setPanelId] = useState<number | null>(null);
  const [lines, setLines] = useState<IssueDraftLine[]>([]);
  const [requestKey] = useState(generateClientUuid);

  const detail = query.data;
  const icon = issueFeature.items[0]?.icon ?? "package-export";
  const listCrumb = { label: t("title"), href: issuePageRoutes.list, icon };
  const header = { pageTitle: t("title"), pageDescription: t("description") };

  if (!detail || !isIssuableOrder(detail.order.status)) {
    let body: React.ReactNode = <LoadingState variant="list" />;
    if (detail) {
      body = (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("issueScreen.notOpen", { code: detail.order.code })}
        />
      );
    } else if (!orderId || isNotFoundError(query.error) || query.isError) {
      body = (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("orderNotFound")}
        />
      );
    }
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("issueScreen.title") }]}
        title={t("issueScreen.title")}
      >
        {body}
      </DetailPageLayout>
    );
  }

  const panel = detail.panels.find((entry) => entry.lineId === panelId) ?? null;
  const over = overBomItemIds(lines, detail.items);
  const positive = lines.filter((line) => quantityOf(line.quantity).greaterThan(0));
  const blocked =
    create.isPending ||
    positive.length === 0 ||
    positive.some((line) => needsReason(line, over));
  const onBom = (itemId: number) =>
    detail.panels.some((entry) =>
      entry.bomLines.some((bom) => bom.itemId === itemId),
    );
  // A line with no panel is for the whole order while the item is on its BOM.
  const panelTag = (row: IssueDraftLine) => {
    if (row.orderLineId !== null) {
      return (
        detail.panels.find((entry) => entry.lineId === row.orderLineId)?.tag ??
        t("emptyValue")
      );
    }
    return onBom(row.itemId)
      ? t("issueScreen.noPanel")
      : t("issueScreen.outsideBom");
  };
  const update = (key: string, patch: Partial<IssueDraftLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const itemColumns: Array<TableColumn<MaterialItemRow>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    {
      key: "demand",
      ...PLAIN,
      header: t("lines.demand"),
      render: (_, row) => quantityText(row.demand),
    },
    {
      key: "reserved",
      ...PLAIN,
      header: t("lines.reserved"),
      render: (_, row) => quantityText(row.reserved),
    },
    {
      key: "issued",
      ...PLAIN,
      header: t("lines.out"),
      render: (_, row) => quantityText(outAtWorkshop(row).toNumber()),
    },
    {
      key: "short",
      ...PLAIN,
      header: t("lines.short"),
      render: (_, row) => quantityText(row.short),
    },
  ];

  const panelColumns: Array<TableColumn<PanelBomLine>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    {
      key: "perPanelQuantity",
      ...PLAIN,
      header: t("lines.perPanel"),
      render: (_, row) => quantityText(row.perPanelQuantity),
    },
    {
      key: "demand",
      ...PLAIN,
      header: t("lines.panelDemand"),
      render: (_, row) => quantityText(row.demand),
    },
  ];

  const draftColumns: Array<TableColumn<IssueDraftLine>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    {
      key: "orderLineId",
      ...PLAIN,
      header: t("lines.panel"),
      render: (_, row) => panelTag(row),
    },
    {
      key: "quantity",
      ...PLAIN,
      header: t("lines.quantity"),
      render: (_, row) => (
        <NumberInput
          aria-label={t("lines.quantityOf", { code: row.itemCode })}
          decimalScale={ISSUE_QUANTITY_DECIMALS}
          value={row.quantity}
          disabled={create.isPending}
          onChange={(event) => update(row.key, { quantity: event.target.value })}
        />
      ),
    },
    {
      key: "reason",
      ...PLAIN,
      header: t("lines.reason"),
      render: (_, row) => (
        <FormInput
          label={t("lines.reasonOf", { code: row.itemCode })}
          aria-label={t("lines.reasonOf", { code: row.itemCode })}
          labelHidden
          maxLength={ISSUE_REASON_MAX}
          value={row.reason}
          required={over.has(row.itemId)}
          error={needsReason(row, over) ? t("lines.reasonRequired") : undefined}
          disabled={create.isPending}
          onChange={(event) => update(row.key, { reason: event.target.value })}
        />
      ),
    },
  ];

  const submit = () => {
    if (blocked) return;
    create.mutate(
      {
        orderId: detail.order.id,
        requestKey,
        lines: positive.map((line) => ({
          itemId: line.itemId,
          quantity: quantityOf(line.quantity).toNumber(),
          ...(line.orderLineId !== null ? { orderLineId: line.orderLineId } : {}),
          ...(line.reason.trim() ? { reason: line.reason.trim() } : {}),
        })),
      },
      {
        onSuccess: () =>
          router.push(materialPageRoutes.order(detail.order.id)),
      },
    );
  };

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: detail.order.code }]}
      title={t("issueScreen.titleOf", { code: detail.order.code })}
      subtitle={detail.order.customerName}
    >
      <DetailSection title={t("issueScreen.itemsTitle")}>
        <Table
          columns={itemColumns}
          data={detail.items}
          rowKey={(row) => String(row.itemId)}
        />
      </DetailSection>

      <DetailSection title={t("issueScreen.scanTitle")}>
        <div className="flex flex-col gap-3">
          <div
            role="group"
            aria-label={t("issueScreen.panel")}
            className="flex flex-wrap gap-2"
          >
            {[null, ...detail.panels.map((entry) => entry.lineId)].map((id) => (
              <button
                key={id ?? "order"}
                type="button"
                aria-pressed={panelId === id}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  panelId === id
                    ? "border-brand bg-brand text-white"
                    : "border-border-secondary text-text-primary",
                )}
                onClick={() => setPanelId(id)}
              >
                {id === null
                  ? t("issueScreen.noPanel")
                  : detail.panels.find((entry) => entry.lineId === id)?.tag}
              </button>
            ))}
          </div>
          {panel ? (
            <Table
              columns={panelColumns}
              data={panel.bomLines}
              rowKey={(row) => String(row.bomLineId)}
            />
          ) : null}
          <p className="text-sm text-text-secondary">{t("issueScreen.hint")}</p>
          <ScanInput
            resolve={resolveScannedItem}
            onResult={(item) =>
              setLines((current) => addScanned(current, panel, item))
            }
            errorMessage={(error) =>
              isNotFoundError(error) ? t("scan.notFound") : t("scan.failed")
            }
            placeholder={t("scan.placeholder")}
            disabled={create.isPending}
          />
        </div>
      </DetailSection>

      <DetailSection title={t("issueScreen.linesTitle")}>
        {lines.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("issueScreen.noLines")}</p>
        ) : (
          <Table columns={draftColumns} data={lines} rowKey={(row) => row.key} />
        )}
      </DetailSection>

      <div className="flex justify-end">
        <Button type="button" disabled={blocked} onClick={submit}>
          {t("issueScreen.submit")}
        </Button>
      </div>
    </DetailPageLayout>
  );
}
