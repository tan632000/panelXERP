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
import { PageToolbarActions } from "@/kernel/core/components/ui/PageToolbarActions";
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
  DELIVERY_NOTE_STATUSES,
  deliveryNotePageRoutes,
  type DeliveryNoteStatus,
} from "@plugins/delivery/delivery-note/constants";
import { useDeliveryNotes } from "@plugins/delivery/delivery-note/hooks/api/useDeliveryNote";
import { DeliveryNotePermission } from "@plugins/delivery/delivery-note/permissions/delivery-note-permission.keys";

import { DeliveryNoteStatusBadge } from "./DeliveryNoteStatusBadge";

import type { DeliveryNoteSummary } from "@plugins/delivery/delivery-note/types";

const PLAIN = { filterable: false, sortable: false } as const;

/** The delivery notes the caller's orders reach, by status. */
export function DeliveryNoteListPage() {
  const t = useTranslations("delivery");
  const router = useRouter();
  const canCreate = useAuth().can(DeliveryNotePermission.create);
  const [currentPage, setCurrentPage] = useListViewState("page", 1);
  const [status, setStatus] = useListViewState<string>("status", "");
  const { data, isLoading, isError } = useDeliveryNotes({
    status: (status || undefined) as DeliveryNoteStatus | undefined,
    page: currentPage,
    limit: DEFAULT_LIST_PAGE_SIZE,
  });
  useQueryErrorToast(isError, t("note.loadError"));

  const items = data?.data ?? [];
  const { totalItems, totalPages, startIndex, endIndex } =
    computePaginationMeta({
      page: currentPage,
      pageSize: DEFAULT_LIST_PAGE_SIZE,
      totalItems: data?.meta?.total ?? 0,
      totalPages: data?.meta?.totalPages,
      currentPageItemCount: items.length,
    });

  const columns: Array<TableColumn<DeliveryNoteSummary>> = [
    {
      key: "code",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("note.columns.code"),
      render: (_, row) => <span className="font-mono">{row.code}</span>,
    },
    {
      key: "orderCode",
      ...PLAIN,
      header: t("note.columns.order"),
      render: (_, row) => row.orderCode ?? t("emptyValue"),
    },
    {
      key: "customerName",
      ...PLAIN,
      header: t("note.columns.customer"),
      render: (_, row) => row.customerName ?? t("emptyValue"),
    },
    {
      key: "unitCount",
      ...PLAIN,
      header: t("note.columns.unitCount"),
      render: (_, row) => row.unitCount,
    },
    {
      key: "status",
      ...PLAIN,
      header: t("note.columns.status"),
      render: (_, row) => <DeliveryNoteStatusBadge status={row.status} />,
    },
    {
      key: "receivedDate",
      ...PLAIN,
      header: t("note.columns.receivedDate"),
      render: (_, row) =>
        row.receivedDate ? formatIsoDate(row.receivedDate) : t("emptyValue"),
    },
  ];

  return (
    <>
      <PageHeader title={t("note.title")} description={t("note.description")} />
      <ListPageLayout>
        <ListToolbar>
          <FormSelect
            label={t("note.columns.status")}
            labelHidden
            placeholder={t("note.allStatuses")}
            allowClear
            searchable={false}
            value={status}
            options={DELIVERY_NOTE_STATUSES.map((value) => ({
              value,
              label: t(`note.statuses.${value}`),
            }))}
            onChange={(event) => {
              setStatus(event.target.value);
              setCurrentPage(1);
            }}
          />
          <PageToolbarActions
            addButtonLabel={canCreate ? t("note.create.open") : undefined}
            onAddClick={
              canCreate
                ? () => router.push(deliveryNotePageRoutes.create)
                : undefined
            }
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
                  empty: t("note.none"),
                  notFound: t("note.noneFound"),
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
              itemLabel: t("note.item"),
            }}
          >
            <Table
              columns={columns}
              data={items}
              rowKey={(row) => String(row.id)}
              onRowClick={(row) =>
                router.push(deliveryNotePageRoutes.detail(row.id))
              }
            />
          </ListQueryBody>
        </TableMobileCards>
      </ListPageLayout>
    </>
  );
}
