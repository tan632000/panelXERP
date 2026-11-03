"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { PageToolbarActions } from "@/kernel/core/components/ui/PageToolbarActions";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { parsePositiveIntId } from "@/kernel/core/lib/entity-id";
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import { resolveListEmptyMessage } from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { Link, useRouter } from "@/kernel/i18n/navigation";

import {
  PRODUCTION_ORDER_STATUSES,
  productionOrderPageRoutes,
  type ProductionOrderStatus,
} from "@plugins/production/production-order/constants";
import { useProductionOrderList } from "@plugins/production/production-order/hooks/api/useProductionOrder";
import { ProductionOrderPermission } from "@plugins/production/production-order/permissions/production-order-permission.keys";
import { productionOrderFeature } from "@plugins/production/production-order/production-order.feature";

import { ProductionOrderCreateDialog } from "./ProductionOrderCreateDialog";
import { ProductionOrderStatusBadge } from "./ProductionOrderStatusBadge";

import type { ProductionOrderRow } from "@plugins/production/production-order/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** Production orders, optionally narrowed by status or to one sales order (`?orderId=`). */
export function ProductionOrderListPage() {
  const t = useTranslations("production");
  const { can } = useAuth();
  const router = useRouter();
  const canCreate = can(ProductionOrderPermission.create);
  const orderId =
    parsePositiveIntId(useSearchParams().get("orderId")) ?? undefined;
  const [creating, setCreating] = useState(false);

  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [status, setStatus] = useListViewState<string>("status", "");
  const params = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIST_PAGE_SIZE,
      status: (status || undefined) as ProductionOrderStatus | undefined,
      orderId,
    }),
    [currentPage, status, orderId],
  );
  const { data: listData, isLoading, isError } = useProductionOrderList(params);
  useQueryErrorToast(isError, t("loadError"));

  const items = listData?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: listData?.meta?.total ?? 0,
      totalPages: listData?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const columns: Array<TableColumn<ProductionOrderRow>> = [
    {
      key: "code",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("code"),
      render: (_, row) => (
        <span className="font-mono font-semibold text-text-primary">
          {row.code}
        </span>
      ),
    },
    {
      key: "orderCode",
      ...PLAIN,
      header: t("orderCode"),
      render: (_, row) => <span className="font-mono">{row.orderCode}</span>,
    },
    {
      key: "customerName",
      ...PLAIN,
      header: t("customer"),
      render: (_, row) => row.customerName ?? t("emptyValue"),
    },
    {
      key: "deliveryDate",
      ...PLAIN,
      header: t("deliveryDate"),
      render: (_, row) =>
        row.deliveryDate ? formatIsoDate(row.deliveryDate) : t("emptyValue"),
    },
    { key: "unitCount", ...PLAIN, header: t("unitCount") },
    {
      key: "status",
      ...PLAIN,
      header: t("status"),
      render: (_, row) => <ProductionOrderStatusBadge status={row.status} />,
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <ListPageLayout>
        <ListToolbar>
          <FormSelect
            label={t("status")}
            labelHidden
            placeholder={t("allStatuses")}
            allowClear
            searchable={false}
            value={status}
            options={PRODUCTION_ORDER_STATUSES.map((value) => ({
              value,
              label: t(`statuses.${value}`),
            }))}
            onChange={(event) => {
              setStatus(event.target.value);
              setCurrentPage(1);
            }}
          />
          {orderId ? (
            <Link
              href={productionOrderPageRoutes.list}
              className="text-sm text-brand underline"
            >
              {t("clearOrderFilter")}
            </Link>
          ) : null}
          <PageToolbarActions
            addButtonLabel={canCreate ? t("addButton") : undefined}
            onAddClick={canCreate ? () => setCreating(true) : undefined}
          />
        </ListToolbar>

        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon={
                  productionOrderFeature.items[0]?.icon ?? "building-factory"
                }
                message={resolveListEmptyMessage(Boolean(status || orderId), {
                  empty: t("noItems"),
                  notFound: t("noItemsFound"),
                })}
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
              data={items}
              rowKey={(row) => String(row.id)}
              onRowClick={(row) =>
                router.push(productionOrderPageRoutes.detail(row.id))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>

      {canCreate ? (
        <ProductionOrderCreateDialog
          isOpen={creating}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}
