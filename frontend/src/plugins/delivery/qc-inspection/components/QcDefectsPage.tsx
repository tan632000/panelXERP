"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
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
import { Link } from "@/kernel/i18n/navigation";

import {
  QC_DEFECT_STATUSES,
  QC_NOTE_MAX,
  qcPageRoutes,
  type QcDefectStatus,
} from "@plugins/delivery/qc-inspection/constants";
import {
  useFixQcDefect,
  useQcDefects,
  useVerifyQcDefect,
} from "@plugins/delivery/qc-inspection/hooks/api/useQcInspection";
import { QcInspectionPermission } from "@plugins/delivery/qc-inspection/permissions/qc-inspection-permission.keys";

import { QcDefectStatusBadge } from "./QcStatusBadge";

import type { QcDefect } from "@plugins/delivery/qc-inspection/types";

const PLAIN = { filterable: false, sortable: false } as const;

/**
 * Defects QC found. A production manager marks an open one fixed with a note; a QC inspector
 * verifies a fixed one, never the one who fixed it.
 */
export function QcDefectsPage() {
  const t = useTranslations("delivery");
  const { can, user } = useAuth();
  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [status, setStatus] = useListViewState<string>("status", "");
  const [fixing, setFixing] = useState<QcDefect | null>(null);
  const { data, isLoading, isError } = useQcDefects({
    status: (status || undefined) as QcDefectStatus | undefined,
    page: currentPage,
    limit: DEFAULT_LIST_PAGE_SIZE,
  });
  useQueryErrorToast(isError, t("qc.defects.loadError"));
  const fix = useFixQcDefect();
  const verify = useVerifyQcDefect();

  const items = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const columns: Array<TableColumn<QcDefect>> = [
    {
      key: "unitCode",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("qc.defects.columns.unit"),
      render: (_, row) => (
        <Link
          className="font-mono text-brand underline"
          href={qcPageRoutes.unit(row.unitId)}
        >
          {row.unitCode}
        </Link>
      ),
    },
    {
      key: "roundNo",
      ...PLAIN,
      header: t("qc.defects.columns.round"),
      render: (_, row) => row.roundNo,
    },
    {
      key: "description",
      ...PLAIN,
      header: t("qc.defects.columns.description"),
      render: (_, row) => row.description,
    },
    {
      key: "status",
      ...PLAIN,
      header: t("qc.defects.columns.status"),
      render: (_, row) => <QcDefectStatusBadge status={row.status} />,
    },
    {
      key: "fixNote",
      ...PLAIN,
      header: t("qc.defects.columns.fixNote"),
      render: (_, row) => row.fixNote ?? t("emptyValue"),
    },
    {
      key: "actions",
      ...PLAIN,
      header: "",
      render: (_, row) => {
        if (row.status === "open" && can(QcInspectionPermission.fix)) {
          return (
            <Button variant="secondary" onClick={() => setFixing(row)}>
              {t("qc.defects.fix")}
            </Button>
          );
        }
        // Whoever fixed a defect cannot also vouch for it.
        if (
          row.status === "fixed" &&
          can(QcInspectionPermission.verify) &&
          row.fixedBy !== user?.id
        ) {
          return (
            <Button
              variant="secondary"
              disabled={verify.isPending}
              onClick={() => verify.mutate(row.id)}
            >
              {t("qc.defects.verify")}
            </Button>
          );
        }
        return null;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title={t("qc.defects.title")}
        description={t("qc.defects.description")}
      />
      <ListPageLayout>
        <ListToolbar>
          <FormSelect
            label={t("qc.defects.columns.status")}
            labelHidden
            placeholder={t("qc.defects.allStatuses")}
            allowClear
            searchable={false}
            value={status}
            options={QC_DEFECT_STATUSES.map((value) => ({
              value,
              label: t(`qc.defectStatuses.${value}`),
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
                icon="clipboard-list"
                message={resolveListEmptyMessage(Boolean(status), {
                  empty: t("qc.defects.none"),
                  notFound: t("qc.defects.noneFound"),
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
              itemLabel: t("qc.defects.item"),
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

      <CancelReasonModal
        isOpen={fixing !== null}
        title={t("qc.defects.fixTitle", { unit: fixing?.unitCode ?? "" })}
        description={fixing?.description}
        submitLabel={t("qc.defects.fix")}
        pending={fix.isPending}
        onClose={() => setFixing(null)}
        onConfirm={(note) => {
          if (!fixing) return;
          fix.mutate(
            { id: fixing.id, note },
            { onSuccess: () => setFixing(null) },
          );
        }}
        reasonLabel={t("qc.defects.fixNote")}
        placeholder={t("qc.defects.fixPlaceholder")}
        requiredMessage={t("qc.defects.fixRequired")}
        maxLengthMessage={t("qc.defects.fixMax", { max: QC_NOTE_MAX })}
        maxLength={QC_NOTE_MAX}
      />
    </>
  );
}
