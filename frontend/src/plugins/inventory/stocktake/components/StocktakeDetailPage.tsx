"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { ScanInput } from "@/kernel/core/components/ui/ScanInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import {
  getApiErrorStatus,
  isNotFoundError,
} from "@/kernel/core/lib/api-error-mapping";
import {
  formatCurrency,
  formatIsoDateTime,
  formatNumber,
} from "@/kernel/core/lib/formatters";

import {
  STOCKTAKE_QUANTITY_DECIMALS,
  STOCKTAKE_REASON_MAX,
  stocktakePageRoutes,
} from "@plugins/inventory/stocktake/constants";
import {
  useSetStocktakeCount,
  useStocktake,
  useStocktakeAction,
  useStoreStocktake,
} from "@plugins/inventory/stocktake/hooks/api/useStocktake";
import { StocktakePermission } from "@plugins/inventory/stocktake/permissions/stocktake-permission.keys";
import { scanStocktake } from "@plugins/inventory/stocktake/services/stocktake.service";
import { stocktakeFeature } from "@plugins/inventory/stocktake/stocktake.feature";

import type { StocktakeLine } from "@plugins/inventory/stocktake/types";

const PLAIN = { filterable: false, sortable: false } as const;
type Dialog = "submit" | "approve" | "reject" | "cancel" | null;

const quantityText = (value: number | null, empty: string) =>
  value === null ? (
    empty
  ) : (
    <span className="tabular-nums">
      {formatNumber(value, {
        maximumFractionDigits: STOCKTAKE_QUANTITY_DECIMALS,
      })}
    </span>
  );

/**
 * One count: while counting, a scan adds one of the item and a counted quantity can be typed,
 * each shown next to the book quantity of that moment (not blind, user Q3); then submit, and a
 * director who took no part approves or rejects. Costs appear only to a reader the API sent
 * them to.
 */
export function StocktakeDetailPage() {
  const t = useTranslations("stocktake");
  const tCommon = useTranslations("common");
  const id = useEntityIdParam();
  const { can, user } = useAuth();
  const query = useStocktake(id);
  const store = useStoreStocktake();
  const setCount = useSetStocktakeCount(id ?? 0);
  const submit = useStocktakeAction(id ?? 0, "submit");
  const approve = useStocktakeAction(id ?? 0, "approve");
  const reject = useStocktakeAction(id ?? 0, "reject");
  const cancel = useStocktakeAction(id ?? 0, "cancel");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const count = query.data;
  const icon = stocktakeFeature.items[0]?.icon ?? "clipboard-list";
  const listCrumb = { label: t("title"), href: stocktakePageRoutes.list, icon };
  const header = { pageTitle: t("title"), pageDescription: t("description") };

  if (!count) {
    const missing = !id || isNotFoundError(query.error) || query.isError;
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("detailTitle") }]}
        title={t("detailTitle")}
      >
        {missing ? (
          <EmptyState bordered={false} icon={icon} message={t("notFound")} />
        ) : (
          <LoadingState variant="list" />
        )}
      </DetailPageLayout>
    );
  }

  const counting = count.status === "counting";
  const canCount = counting && can(StocktakePermission.update);
  const involved = user ? count.involvedUserIds.includes(user.id) : false;
  const mayDecide =
    count.status === "submitted" && can(StocktakePermission.approve);
  const canSubmit = counting && can(StocktakePermission.submit);
  const canCancel =
    (counting || count.status === "submitted") &&
    can(StocktakePermission.cancel);
  // An approved or cancelled count, or a reader allowed none of these, has nothing to show here.
  const hasActions = canSubmit || mayDecide || canCancel;
  const busy = [setCount, submit, approve, reject, cancel].some(
    (mutation) => mutation.isPending,
  );
  // The API sends costs only to a reader holding `purchase_price:read`.
  const showCosts = count.lines.some((line) => "value" in line);
  const closeDialog = () => setDialog(null);

  // Every save is a recount (D-14): the same quantity again still records today's book
  // quantity, which is what a rejected count's recount needs.
  const commitCount = (line: StocktakeLine) => {
    const draft = drafts[line.itemId];
    if (draft === undefined || draft === "") return;
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) return;
    // Cleared at once, so Enter followed by leaving the field saves once.
    setDrafts((current) => {
      const next = { ...current };
      delete next[line.itemId];
      return next;
    });
    setCount.mutate({ itemId: line.itemId, countedQty: value });
  };

  const columns: Array<TableColumn<StocktakeLine>> = [
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    { key: "itemUnit", ...PLAIN, header: t("lines.unit") },
    {
      key: "bookQty",
      ...PLAIN,
      header: t("lines.book"),
      render: (_, row) => quantityText(row.bookQty, t("emptyValue")),
    },
    {
      key: "countedQty",
      ...PLAIN,
      header: t("lines.counted"),
      render: (_, row) =>
        canCount ? (
          <NumberInput
            aria-label={t("lines.countedOf", { code: row.itemCode })}
            decimalScale={STOCKTAKE_QUANTITY_DECIMALS}
            value={drafts[row.itemId] ?? row.countedQty ?? ""}
            disabled={busy}
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [row.itemId]: event.target.value,
              }))
            }
            onBlur={() => commitCount(row)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitCount(row);
            }}
          />
        ) : (
          quantityText(row.countedQty, t("notCounted"))
        ),
    },
    {
      key: "diff",
      ...PLAIN,
      header: t("lines.diff"),
      render: (_, row) =>
        row.diff === null ? (
          t("emptyValue")
        ) : (
          <span
            className={
              row.diff < 0 ? "text-danger-text tabular-nums" : "tabular-nums"
            }
          >
            {row.diff > 0 ? "+" : ""}
            {formatNumber(row.diff, {
              maximumFractionDigits: STOCKTAKE_QUANTITY_DECIMALS,
            })}
          </span>
        ),
    },
    ...(showCosts
      ? ([
          {
            key: "value",
            ...PLAIN,
            header: t("lines.value"),
            render: (_, row) =>
              row.value === null || row.value === undefined
                ? t("emptyValue")
                : formatCurrency(row.value),
          },
        ] satisfies Array<TableColumn<StocktakeLine>>)
      : []),
  ];

  const reasonProps = {
    reasonLabel: t("reason.label"),
    placeholder: t("reason.placeholder"),
    requiredMessage: t("reason.required"),
    maxLengthMessage: t("reason.max", { max: STOCKTAKE_REASON_MAX }),
    maxLength: STOCKTAKE_REASON_MAX,
  };

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: count.code }]}
      title={count.code}
      subtitle={
        count.scope === "all"
          ? t("scopeAll")
          : t("scopeLocation", { code: count.locationCode ?? "" })
      }
    >
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("status")}>
            {t(`statuses.${count.status}`)}
          </DetailField>
          <DetailField label={t("progress")}>
            {t("progressValue", {
              counted: count.countedCount,
              total: count.lineCount,
            })}
          </DetailField>
          <DetailField label={t("createdBy")}>
            {count.createdByName ?? t("emptyValue")}
          </DetailField>
          <DetailField label={t("createdAt")}>
            {formatIsoDateTime(count.createdAt)}
          </DetailField>
          {count.rejectReason && counting ? (
            <DetailField label={t("rejectReason")} span2>
              {count.rejectReason}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
      </DetailSection>

      {hasActions ? (
        <DetailSection title={t("actions.title")}>
          <div className="flex flex-col gap-3">
            {mayDecide && involved ? (
              <p className="text-sm text-text-secondary">
                {t("involvedCannotDecide")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {canSubmit ? (
                <DetailPanelActionButton
                  variant="primary"
                  icon="check"
                  label={t("actions.submit")}
                  disabled={busy}
                  onClick={() => setDialog("submit")}
                />
              ) : null}
              {mayDecide && !involved ? (
                <>
                  <DetailPanelActionButton
                    variant="primary"
                    icon="circle-check"
                    label={t("actions.approve")}
                    disabled={busy}
                    onClick={() => setDialog("approve")}
                  />
                  <DetailPanelActionButton
                    variant="danger"
                    icon="circle-x"
                    label={t("actions.reject")}
                    disabled={busy}
                    onClick={() => setDialog("reject")}
                  />
                </>
              ) : null}
              {canCancel ? (
                <DetailPanelActionButton
                  variant="danger"
                  icon="ban"
                  label={t("actions.cancel")}
                  disabled={busy}
                  onClick={() => setDialog("cancel")}
                />
              ) : null}
            </div>
          </div>
        </DetailSection>
      ) : null}

      {canCount ? (
        <DetailSection title={t("scanTitle")}>
          <ScanInput
            resolve={(code) => scanStocktake(count.id, code)}
            onResult={store}
            errorMessage={(error) => {
              if (isNotFoundError(error)) return t("scan.notFound");
              if (getApiErrorStatus(error) === 409) return t("scan.closed");
              return t("scan.failed");
            }}
            placeholder={t("scan.placeholder")}
            disabled={busy}
          />
        </DetailSection>
      ) : null}

      <DetailSection title={t("lines.title")}>
        <Table
          columns={columns}
          data={count.lines}
          rowKey={(row) => String(row.id)}
        />
      </DetailSection>

      <ConfirmDialog
        open={dialog === "submit"}
        variant="default"
        icon="check"
        title={t("actions.submitTitle", { code: count.code })}
        description={t("actions.submitDescription")}
        confirmLabel={t("actions.submit")}
        cancelLabel={tCommon("cancel")}
        pending={submit.isPending}
        onCancel={closeDialog}
        onConfirm={() => submit.mutate(undefined, { onSettled: closeDialog })}
      />
      <ConfirmDialog
        open={dialog === "approve"}
        variant="default"
        icon="circle-check"
        title={t("actions.approveTitle", { code: count.code })}
        description={t("actions.approveDescription")}
        confirmLabel={t("actions.approve")}
        cancelLabel={tCommon("cancel")}
        pending={approve.isPending}
        onCancel={closeDialog}
        onConfirm={() => approve.mutate(undefined, { onSettled: closeDialog })}
      />
      <CancelReasonModal
        isOpen={dialog === "reject"}
        title={t("actions.rejectTitle", { code: count.code })}
        submitLabel={t("actions.reject")}
        pending={reject.isPending}
        onClose={closeDialog}
        onConfirm={(reason) =>
          reject.mutate(reason, { onSuccess: closeDialog })
        }
        {...reasonProps}
      />
      <CancelReasonModal
        isOpen={dialog === "cancel"}
        title={t("actions.cancelTitle", { code: count.code })}
        submitLabel={t("actions.cancel")}
        pending={cancel.isPending}
        onClose={closeDialog}
        onConfirm={(reason) =>
          cancel.mutate(reason, { onSuccess: closeDialog })
        }
        {...reasonProps}
      />
    </DetailPageLayout>
  );
}
