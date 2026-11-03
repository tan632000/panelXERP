"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
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
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";
import { resolveListEmptyMessage } from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { Link } from "@/kernel/i18n/navigation";

import {
  ISSUE_STATUSES,
  type IssueStatus,
} from "@plugins/production/production-issue/constants";
import { useIssueList } from "@plugins/production/production-issue/hooks/api/useProductionIssue";
import { ProductionIssuePermission } from "@plugins/production/production-issue/permissions/production-issue-permission.keys";
import { progressPageRoutes } from "@plugins/production/progress/constants";

import { IssueSeverityBadge, IssueStatusBadge } from "./IssueBadges";
import { IssueResolveDialog } from "./IssueResolveDialog";

import type { ProductionIssue } from "@plugins/production/production-issue/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** Every production issue the caller's scope reaches; a manager resolves the open ones here. */
export function IssueListPage() {
  const t = useTranslations("production");
  const { can } = useAuth();
  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [status, setStatus] = useListViewState<string>("status", "");
  const [resolving, setResolving] = useState<ProductionIssue | null>(null);
  const { data, isLoading, isError } = useIssueList({
    status: (status || undefined) as IssueStatus | undefined,
    page: currentPage,
    limit: DEFAULT_LIST_PAGE_SIZE,
  });
  useQueryErrorToast(isError, t("issues.loadError"));

  const items = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: items.length,
    });
  const canResolve = can(ProductionIssuePermission.resolve);

  const columns: Array<TableColumn<ProductionIssue>> = [
    {
      key: "unitCode",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("units.code"),
      render: (_, row) => (
        <Link
          className="font-mono font-semibold text-brand underline"
          href={progressPageRoutes.unit(row.unitId)}
        >
          {row.unitCode}
        </Link>
      ),
    },
    {
      key: "productionOrderCode",
      ...PLAIN,
      header: t("code"),
      render: (_, row) => (
        <span className="font-mono">{row.productionOrderCode}</span>
      ),
    },
    {
      key: "stage",
      ...PLAIN,
      header: t("issues.stage"),
      render: (_, row) => t(`stages.${row.stage}`),
    },
    {
      key: "severity",
      ...PLAIN,
      header: t("issues.severity"),
      render: (_, row) => <IssueSeverityBadge severity={row.severity} />,
    },
    {
      key: "description",
      ...PLAIN,
      header: t("issues.description"),
      render: (_, row) => row.description,
    },
    {
      key: "reportedByName",
      ...PLAIN,
      header: t("issues.reporter"),
      render: (_, row) => row.reportedByName ?? t("emptyValue"),
    },
    {
      key: "createdAt",
      ...PLAIN,
      header: t("createdAt"),
      render: (_, row) => formatIsoDateTime(row.createdAt),
    },
    {
      key: "status",
      ...PLAIN,
      header: t("status"),
      render: (_, row) => <IssueStatusBadge status={row.status} />,
    },
    ...(canResolve
      ? [
          {
            key: "actions",
            ...PLAIN,
            header: "",
            render: (_: unknown, row: ProductionIssue) =>
              row.status === "open" ? (
                <button
                  type="button"
                  className="h-8 rounded-[7px] border border-border-secondary px-3 text-sm font-semibold hover:bg-surface-secondary"
                  onClick={() => setResolving(row)}
                >
                  {t("issues.resolveButton")}
                </button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t("issues.title")}
        description={t("issues.pageDescription")}
      />
      <ListPageLayout>
        <ListToolbar>
          <FormSelect
            label={t("status")}
            labelHidden
            placeholder={t("issues.allStatuses")}
            allowClear
            searchable={false}
            value={status}
            options={ISSUE_STATUSES.map((value) => ({
              value,
              label: t(`issues.statuses.${value}`),
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
                icon="alert-triangle"
                message={resolveListEmptyMessage(Boolean(status), {
                  empty: t("issues.none"),
                  notFound: t("issues.noneFound"),
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
              itemLabel: t("issues.item"),
            }}
          >
            <Table
              columns={columns}
              data={items}
              rowKey={(row) => String(row.id)}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
      <IssueResolveDialog
        issue={resolving}
        onClose={() => setResolving(null)}
      />
    </>
  );
}
