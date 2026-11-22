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
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import { resolveListEmptyMessage } from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import { deliveryNotePageRoutes } from "@plugins/delivery/delivery-note/constants";
import {
  INSTALLATION_STATUSES,
  type InstallationStatus,
} from "@plugins/delivery/installation/constants";
import { useInstallations } from "@plugins/delivery/installation/hooks/api/useInstallation";

import { InstallationStatusBadge } from "./InstallationStatusBadge";

import type { InstallationSummary } from "@plugins/delivery/installation/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** The installations the caller's orders reach, by status; a row opens its order's delivery page. */
export function InstallationListPage() {
  const t = useTranslations("delivery");
  const router = useRouter();
  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [status, setStatus] = useListViewState<string>("status", "");
  const { data, isLoading, isError } = useInstallations({
    status: (status || undefined) as InstallationStatus | undefined,
    page: currentPage,
    limit: DEFAULT_LIST_PAGE_SIZE,
  });
  useQueryErrorToast(isError, t("installation.loadError"));

  const items = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const columns: Array<TableColumn<InstallationSummary>> = [
    {
      key: "orderCode",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("note.columns.order"),
      render: (_, row) => (
        <span className="font-mono">{row.orderCode ?? t("emptyValue")}</span>
      ),
    },
    {
      key: "customerName",
      ...PLAIN,
      header: t("note.columns.customer"),
      render: (_, row) => row.customerName ?? t("emptyValue"),
    },
    {
      key: "projectName",
      ...PLAIN,
      header: t("note.fields.project"),
      render: (_, row) => row.projectName ?? t("emptyValue"),
    },
    {
      key: "plannedDate",
      ...PLAIN,
      header: t("installation.fields.plannedDate"),
      render: (_, row) =>
        row.plannedDate ? formatIsoDate(row.plannedDate) : t("emptyValue"),
    },
    {
      key: "personInCharge",
      ...PLAIN,
      header: t("installation.fields.personInCharge"),
      render: (_, row) => row.personInCharge ?? t("emptyValue"),
    },
    {
      key: "status",
      ...PLAIN,
      header: t("installation.fields.status"),
      render: (_, row) => <InstallationStatusBadge status={row.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("installation.title")}
        description={t("installation.description")}
      />
      <ListPageLayout>
        <ListToolbar>
          <FormSelect
            label={t("installation.fields.status")}
            labelHidden
            placeholder={t("installation.allStatuses")}
            allowClear
            searchable={false}
            value={status}
            options={INSTALLATION_STATUSES.map((value) => ({
              value,
              label: t(`installation.statuses.${value}`),
            }))}
            onChange={(event) => {
              setStatus(event.target.value);
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
                icon="truck"
                message={resolveListEmptyMessage(Boolean(status), {
                  empty: t("installation.noneListed"),
                  notFound: t("installation.noneFound"),
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
              itemLabel: t("installation.item"),
            }}
          >
            <Table
              columns={columns}
              data={items}
              rowKey={(row) => String(row.id)}
              onRowClick={(row) =>
                router.push(deliveryNotePageRoutes.order(row.orderId))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}
