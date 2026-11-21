"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import {
  ListPageLayout,
  ListToolbar,
} from "@/kernel/core/components/ui/ListPageLayout";
import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { DEFAULT_LIST_PAGE_SIZE } from "@/kernel/core/constants/list-ui";
import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { resolveListEmptyMessage } from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  QC_UNIT_STATUSES,
  qcPageRoutes,
  type QcUnitStatus,
} from "@plugins/delivery/qc-inspection/constants";
import { useQcUnits } from "@plugins/delivery/qc-inspection/hooks/api/useQcInspection";

import { QcUnitStatusBadge } from "./QcStatusBadge";

import type { QcUnitSummary } from "@plugins/delivery/qc-inspection/types";

const PLAIN = { filterable: false, sortable: false } as const;

/**
 * The cabinets QC reaches, by QC status. The `orderId` list parameter narrows to one sales
 * order's cabinets; a delivery link carries it, there is no picker for it here.
 */
export function QcUnitListPage() {
  const t = useTranslations("delivery");
  const router = useRouter();
  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [qcStatus, setQcStatus] = useListViewState<string>("qcStatus", "");
  const [orderId] = useListViewState<string>("orderId", "");
  const { data, isLoading, isError } = useQcUnits({
    qcStatus: (qcStatus || undefined) as QcUnitStatus | undefined,
    orderId: orderId ? Number(orderId) : undefined,
    page: currentPage,
    limit: DEFAULT_LIST_PAGE_SIZE,
  });
  useQueryErrorToast(isError, t("qc.loadError"));

  const items = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const columns: Array<TableColumn<QcUnitSummary>> = [
    {
      key: "tag",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("qc.columns.tag"),
      render: (_, row) => <span className="font-semibold">{row.tag}</span>,
    },
    {
      key: "code",
      ...PLAIN,
      header: t("qc.columns.code"),
      render: (_, row) => <span className="font-mono">{row.code}</span>,
    },
    {
      key: "productionOrderCode",
      ...PLAIN,
      header: t("qc.columns.productionOrder"),
      render: (_, row) => (
        <span className="font-mono">{row.productionOrderCode}</span>
      ),
    },
    {
      key: "orderCode",
      ...PLAIN,
      header: t("qc.columns.order"),
      render: (_, row) => row.orderCode ?? t("emptyValue"),
    },
    {
      key: "customerName",
      ...PLAIN,
      header: t("qc.columns.customer"),
      render: (_, row) => row.customerName ?? t("emptyValue"),
    },
    {
      key: "qcStatus",
      ...PLAIN,
      header: t("qc.columns.status"),
      render: (_, row) => <QcUnitStatusBadge status={row.qcStatus} />,
    },
  ];

  return (
    <>
      <PageHeader title={t("qc.title")} description={t("qc.description")} />
      <ListPageLayout>
        <ListToolbar>
          <FormSelect
            label={t("qc.columns.status")}
            labelHidden
            placeholder={t("qc.allStatuses")}
            allowClear
            searchable={false}
            value={qcStatus}
            options={QC_UNIT_STATUSES.map((value) => ({
              value,
              label: t(`qc.statuses.${value}`),
            }))}
            onChange={(event) => {
              setQcStatus(event.target.value);
              setCurrentPage(1);
            }}
          />
        </ListToolbar>
        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon="clipboard-list"
                message={resolveListEmptyMessage(Boolean(qcStatus || orderId), {
                  empty: t("qc.noUnits"),
                  notFound: t("qc.noUnitsFound"),
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
              itemLabel: t("qc.unitItem"),
            }}
          >
            <Table
              columns={columns}
              data={items}
              rowKey={(row) => String(row.unitId)}
              onRowClick={(row) => router.push(qcPageRoutes.unit(row.unitId))}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}
