"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { ListPageLayout } from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { ScanInput } from "@/kernel/core/components/ui/ScanInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { formatNumber } from "@/kernel/core/lib/formatters";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import { purchaseOrderPageRoutes } from "@plugins/inventory/purchase-order/constants";
import { PurchaseOrderPermission } from "@plugins/inventory/purchase-order/permissions/purchase-order-permission.keys";
import { PURCHASE_REQUEST_QUANTITY_DECIMALS } from "@plugins/inventory/purchase-request/constants";
import {
  useCancelPurchaseRequest,
  useCreatePurchaseRequest,
  useOrderRequestLines,
  usePurchaseRequestList,
  useSuppliers,
} from "@plugins/inventory/purchase-request/hooks/api/usePurchaseRequest";
import { PurchaseRequestPermission } from "@plugins/inventory/purchase-request/permissions/purchase-request-permission.keys";
import { purchaseRequestFeature } from "@plugins/inventory/purchase-request/purchase-request.feature";
import { resolveItem } from "@plugins/inventory/purchase-request/services/purchase-request.service";

import type {
  PurchaseRequest,
  PurchaseRequestLine,
} from "@plugins/inventory/purchase-request/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** One request line as listed, with its request's code and status beside it. */
interface ListedLine extends PurchaseRequestLine {
  requestId: number;
  requestCode: string;
  status: PurchaseRequest["status"];
}

interface DraftLine {
  itemId: number;
  code: string;
  name: string;
  quantity: string;
}

const quantityText = (value: number) => (
  <span className="tabular-nums">
    {formatNumber(value, {
      maximumFractionDigits: PURCHASE_REQUEST_QUANTITY_DECIMALS,
    })}
  </span>
);

/**
 * Requests and what remains of each line. Purchasing picks open lines and a supplier to turn
 * them into a draft purchase order for what they still have remaining; anyone allowed raises a
 * request by scanning or typing item codes.
 */
export function PurchaseRequestListPage() {
  const t = useTranslations("purchaseRequest");
  const { can } = useAuth();
  const router = useRouter();
  const canOrder = can(PurchaseOrderPermission.create);
  const canCreate = can(PurchaseRequestPermission.create);
  const canCancel = can(PurchaseRequestPermission.cancel);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const params = useMemo(
    () => ({ page: currentPage, limit: DEFAULT_LIST_PAGE_SIZE }),
    [currentPage],
  );
  const { data: listData, isLoading, isError } = usePurchaseRequestList(params);
  useQueryErrorToast(isError, t("loadError"));
  const suppliers = useSuppliers(canOrder);
  const order = useOrderRequestLines();
  const create = useCreatePurchaseRequest();
  const cancel = useCancelPurchaseRequest();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [supplierId, setSupplierId] = useState("");
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [cancelling, setCancelling] = useState<PurchaseRequest | null>(null);

  const requests = listData?.data ?? [];
  const lines: ListedLine[] = requests.flatMap((request) =>
    request.lines.map((line) => ({
      ...line,
      requestId: request.id,
      requestCode: request.code,
      status: request.status,
    })),
  );
  const orderable = (line: ListedLine) =>
    line.status === "open" && line.remaining > 0;
  const picked = lines.filter(
    (line) => selected.has(line.id) && orderable(line),
  );
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: requests.length,
    });

  const toggle = (lineId: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });

  const columns: Array<TableColumn<ListedLine>> = [
    ...(canOrder
      ? ([
          {
            key: "select",
            ...PLAIN,
            header: "",
            render: (_, row) =>
              orderable(row) ? (
                <input
                  type="checkbox"
                  aria-label={t("selectLine", {
                    code: row.itemCode,
                    request: row.requestCode,
                  })}
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                />
              ) : null,
          },
        ] satisfies Array<TableColumn<ListedLine>>)
      : []),
    {
      key: "requestCode",
      ...PLAIN,
      header: t("code"),
      render: (_, row) => <span className="font-mono">{row.requestCode}</span>,
    },
    {
      key: "status",
      ...PLAIN,
      header: t("status"),
      render: (_, row) => t(`statuses.${row.status}`),
    },
    {
      key: "itemCode",
      ...PLAIN,
      header: t("lines.code"),
      render: (_, row) => <span className="font-mono">{row.itemCode}</span>,
    },
    { key: "itemName", ...PLAIN, header: t("lines.name") },
    {
      key: "quantity",
      ...PLAIN,
      header: t("lines.quantity"),
      render: (_, row) => quantityText(row.quantity),
    },
    {
      key: "ordered",
      ...PLAIN,
      header: t("lines.ordered"),
      render: (_, row) => quantityText(row.ordered),
    },
    {
      key: "remaining",
      ...PLAIN,
      header: t("lines.remaining"),
      render: (_, row) => quantityText(row.remaining),
    },
    {
      key: "sourceOrderCode",
      ...PLAIN,
      header: t("lines.sourceOrder"),
      render: (_, row) => row.sourceOrderCode ?? t("emptyValue"),
    },
    ...(canCancel
      ? ([
          {
            key: "cancel",
            ...PLAIN,
            header: "",
            render: (_, row) => {
              const request = requests.find(
                (entry) => entry.id === row.requestId,
              );
              const first = request?.lines[0]?.id === row.id;
              const untouched =
                request?.status === "open" &&
                request.lines.every((line) => line.ordered === 0);
              return first && untouched && request ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCancelling(request)}
                >
                  {t("cancel")}
                </Button>
              ) : null;
            },
          },
        ] satisfies Array<TableColumn<ListedLine>>)
      : []),
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {/* The forms sit inside the list layout, above its body: that gives them the page gutter,
          and they stay put while only the table scrolls. */}
      <ListPageLayout>
        {canCreate ? (
          <DetailSection title={t("create.title")}>
            <div className="flex flex-col gap-3">
              <ScanInput
                resolve={resolveItem}
                onResult={(item) =>
                  setDraft((current) =>
                    current.some((line) => line.itemId === item.id)
                      ? current
                      : [
                          ...current,
                          {
                            itemId: item.id,
                            code: item.code,
                            name: item.name,
                            quantity: "1",
                          },
                        ],
                  )
                }
                errorMessage={(error) =>
                  isNotFoundError(error) ? t("scan.notFound") : t("scan.failed")
                }
                placeholder={t("scan.placeholder")}
                disabled={create.isPending}
              />
              {draft.map((line) => (
                <div
                  key={line.itemId}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="font-mono">{line.code}</span>
                  <span className="min-w-[160px]">{line.name}</span>
                  {/* `cn` only joins classes, so a width on the input loses to its own `w-full`. */}
                  <div className="w-32 shrink-0">
                    <NumberInput
                      aria-label={t("create.quantityOf", { code: line.code })}
                      className="text-right"
                      decimalScale={PURCHASE_REQUEST_QUANTITY_DECIMALS}
                      value={line.quantity}
                      onChange={(event) =>
                        setDraft((current) =>
                          current.map((entry) =>
                            entry.itemId === line.itemId
                              ? { ...entry, quantity: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="cursor-pointer text-danger-text"
                    aria-label={t("create.remove", { code: line.code })}
                    onClick={() =>
                      setDraft((current) =>
                        current.filter((entry) => entry.itemId !== line.itemId),
                      )
                    }
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  disabled={
                    create.isPending ||
                    draft.length === 0 ||
                    draft.some((line) => !(Number(line.quantity) > 0))
                  }
                  onClick={() =>
                    create.mutate(
                      {
                        lines: draft.map((line) => ({
                          itemId: line.itemId,
                          quantity: Number(line.quantity),
                        })),
                      },
                      { onSuccess: () => setDraft([]) },
                    )
                  }
                >
                  {t("create.submit")}
                </Button>
              </div>
            </div>
          </DetailSection>
        ) : null}

        {canOrder ? (
          <DetailSection title={t("order.title")}>
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label={t("order.supplier")}
                className="h-9 rounded-[7px] border border-border-secondary bg-surface-primary px-2 text-sm"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">{t("order.pickSupplier")}</option>
                {(suppliers.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {`${supplier.code} — ${supplier.name}`}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={
                  order.isPending || picked.length === 0 || supplierId === ""
                }
                onClick={() =>
                  order.mutate(
                    {
                      supplierId: Number(supplierId),
                      lines: picked.map((line) => ({
                        prLineId: line.id,
                        quantity: line.remaining,
                      })),
                    },
                    {
                      onSuccess: (created) => {
                        setSelected(new Set());
                        router.push(purchaseOrderPageRoutes.detail(created.id));
                      },
                    },
                  )
                }
              >
                {t("order.submit", { count: picked.length })}
              </Button>
            </div>
          </DetailSection>
        ) : null}

        <ListQueryBody
          isLoading={isLoading}
          isEmpty={lines.length === 0}
          emptyState={
            <EmptyState
              icon={purchaseRequestFeature.items[0]?.icon ?? "clipboard-list"}
              message={t("noItems")}
            />
          }
          pagination={{
            currentPage,
            totalPages,
            totalItems,
            startIndex,
            endIndex,
            onPageChange: setCurrentPage,
            itemLabel: t("paginationItem"),
          }}
        >
          <Table
            columns={columns}
            data={lines}
            rowKey={(row) => String(row.id)}
          />
        </ListQueryBody>
      </ListPageLayout>

      <CancelReasonModal
        isOpen={cancelling !== null}
        title={t("cancelTitle", { code: cancelling?.code ?? "" })}
        submitLabel={t("cancel")}
        pending={cancel.isPending}
        reasonLabel={t("reason.label")}
        placeholder={t("reason.placeholder")}
        requiredMessage={t("reason.required")}
        maxLengthMessage={t("reason.max", { max: 2000 })}
        maxLength={2000}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) =>
          cancelling &&
          cancel.mutate(
            { id: cancelling.id, reason },
            { onSuccess: () => setCancelling(null) },
          )
        }
      />
    </>
  );
}
