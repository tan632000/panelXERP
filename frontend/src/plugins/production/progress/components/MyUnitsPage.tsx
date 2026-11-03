"use client";

import { useTranslations } from "next-intl";
import React from "react";

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
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import { resolveListEmptyMessage } from "@/kernel/core/lib/list-params";
import { computePaginationMeta } from "@/kernel/core/lib/pagination";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  progressPageRoutes,
  STAGE_STATUSES,
  type StageStatus,
} from "@plugins/production/progress/constants";
import { useUnitList } from "@plugins/production/progress/hooks/api/useProgress";
import { ProductionProgressPermission } from "@plugins/production/progress/permissions/progress-permission.keys";

import { UnitProgressCell } from "./UnitProgressCell";

import type { UnitProgress } from "@plugins/production/progress/types";

const PLAIN = { filterable: false, sortable: false } as const;

/**
 * A technician sees the cabinets assigned to them. Whoever may undo a stage runs the workshop
 * and is never assigned a cabinet, so they see every cabinet their scope reaches instead,
 * narrowed by the status of its current stage.
 */
export function MyUnitsPage() {
  const t = useTranslations("production");
  const { can } = useAuth();
  const router = useRouter();
  const workshop = can(ProductionProgressPermission.undo);
  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [stageStatus, setStageStatus] = useListViewState<string>(
    "stageStatus",
    "",
  );
  const { data, isLoading, isError } = useUnitList({
    mine: workshop ? undefined : true,
    stageStatus: workshop
      ? ((stageStatus || undefined) as StageStatus | undefined)
      : undefined,
    page: currentPage,
    limit: DEFAULT_LIST_PAGE_SIZE,
  });
  useQueryErrorToast(isError, t("unitsLoadError"));

  const items = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const columns: Array<TableColumn<UnitProgress>> = [
    {
      key: "code",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("units.code"),
      render: (_, row) => (
        <span className="font-mono font-semibold">{row.code}</span>
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
      key: "description",
      ...PLAIN,
      header: t("units.description"),
      render: (_, row) => row.description ?? t("emptyValue"),
    },
    {
      key: "progress",
      ...PLAIN,
      header: t("units.progress"),
      render: (_, row) => (
        <UnitProgressCell
          doneCount={row.doneCount}
          currentStage={row.currentStage}
        />
      ),
    },
    ...(workshop
      ? [
          {
            key: "assigneeName",
            ...PLAIN,
            header: t("units.assignee"),
            render: (_: unknown, row: UnitProgress) =>
              row.assigneeName ?? t("units.unassigned"),
          },
        ]
      : []),
    {
      key: "plannedEndDate",
      ...PLAIN,
      header: t("units.plannedEndDate"),
      render: (_, row) =>
        row.plannedEndDate
          ? formatIsoDate(row.plannedEndDate)
          : t("emptyValue"),
    },
  ];

  return (
    <>
      <PageHeader
        title={t(workshop ? "workshopUnits" : "myUnits")}
        description={t(
          workshop ? "workshopUnitsDescription" : "myUnitsDescription",
        )}
      />
      <ListPageLayout>
        {workshop ? (
          <ListToolbar>
            <FormSelect
              label={t("units.progress")}
              labelHidden
              placeholder={t("allStageStatuses")}
              allowClear
              searchable={false}
              value={stageStatus}
              options={STAGE_STATUSES.map((value) => ({
                value,
                label: t(`stageStatuses.${value}`),
              }))}
              onChange={(event) => {
                setStageStatus(event.target.value);
                setCurrentPage(1);
              }}
            />
          </ListToolbar>
        ) : null}
        <TableMobileCards>
          <ListQueryBody
            isLoading={isLoading}
            isEmpty={items.length === 0}
            emptyState={
              <EmptyState
                icon="building-factory"
                message={
                  workshop
                    ? resolveListEmptyMessage(Boolean(stageStatus), {
                        empty: t("noWorkshopUnits"),
                        notFound: t("noUnitsFound"),
                      })
                    : t("noUnits")
                }
              />
            }
            pagination={{
              currentPage,
              totalPages,
              totalItems,
              startIndex,
              endIndex,
              onPageChange: setCurrentPage,
              itemLabel: t("unitItem"),
            }}
          >
            <Table
              columns={columns}
              data={items}
              rowKey={(row) => String(row.id)}
              onRowClick={(row) => router.push(progressPageRoutes.unit(row.id))}
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}
