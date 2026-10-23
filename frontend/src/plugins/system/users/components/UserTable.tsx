"use client";

import { useLocale, useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { ImagePreviewModal } from "@/kernel/core/components/ui/ImagePreviewModal";
import {
  Table,
  type TableColumn,
  type TableColumnFilterHostProps,
  type TableSortHostProps,
} from "@/kernel/core/components/ui/Table";
import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { useUserDepartments } from "@/kernel/core/hooks/useUserDepartments";
import { initials } from "@/kernel/core/lib/initials";
import { toIntlLocale } from "@/kernel/i18n/locale";

import { useRoleLabels } from "@plugins/system/roles/hooks/useRoleLabels";
import {
  USER_LIST_PREFERENCE_KEY,
  adminUserApiRoutes,
} from "@plugins/system/users/constants";

import type { AdminUser } from "@plugins/system/users/types";

export interface UserTableProps
  extends TableColumnFilterHostProps, TableSortHostProps {
  data: AdminUser[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  /** Shown in the table selection bar while at least one row is ticked. */
  selectionActions?: React.ReactNode;
  /** The signed-in account, which may not be part of a batch that deactivates. */
  currentUserId?: number;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  /** Opens the review of a signature the account submitted. */
  onReviewSignature: (user: AdminUser) => void;
}

export function UserTable({
  data,
  selectedKeys,
  onSelectionChange,
  selectionActions,
  currentUserId,
  onEdit,
  onToggleActive,
  onDelete,
  onReviewSignature,
  columnFilterParams,
  columnFilters,
  onColumnFiltersChange,
  sort,
  onSortChange,
}: UserTableProps) {
  const t = useTranslations("system.users");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { labelOfName } = useRoleLabels();
  const { labelOf: departmentLabel } = useUserDepartments();
  const empty = t("emptyValue");
  const [preview, setPreview] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const columns = useMemo<Array<TableColumn<AdminUser>>>(
    () => [
      {
        key: "avatarUrl",
        header: t("avatar"),
        // The column filters on whether a picture is on file, not on the picture itself.
        filterLabel: (value) =>
          value === "true" ? t("withAvatar") : t("withoutAvatar"),
        className: "w-[64px]",
        render: (_, user) => {
          const name = user.fullName || user.username;
          const title = t("avatarOf", { name });
          const url = user.avatarUrl;
          // Without a picture the account shows by its initials, as it does on its profile.
          return url ? (
            <button
              type="button"
              title={title}
              aria-label={title}
              onClick={() => setPreview({ url, title })}
              className="inline-flex size-9 cursor-zoom-in overflow-hidden rounded-full border-none p-0 ring-1 ring-border-secondary transition hover:ring-2 hover:ring-brand"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={title} className="size-full object-cover" />
            </button>
          ) : (
            <span
              aria-label={title}
              className="inline-flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-50 to-brand-light text-xs font-bold text-brand"
            >
              {initials(name)}
            </span>
          );
        },
      },
      {
        key: "username",
        mobile: { role: "title", record: true },
        header: t("username"),
        render: (_, user) => (
          <span className="font-mono font-bold text-text-primary">
            {user.username}
          </span>
        ),
      },
      {
        key: "fullName",
        mobile: { role: "title", record: true },
        header: t("fullName"),
        render: (_, user) => (
          <span className="block truncate font-semibold text-text-primary">
            {user.fullName}
          </span>
        ),
      },
      { key: "email", header: t("email") },
      {
        key: "signatureUrl",
        header: t("signature"),
        filterLabel: (value) => {
          if (value === "pending") return t("signaturePendingFilter");
          return value === "true" ? t("withSignature") : t("withoutSignature");
        },
        className: "w-[140px]",
        render: (_, user) => {
          const url = user.signatureUrl;
          const review = user.pendingSignatureUrl ? (
            <button
              type="button"
              onClick={() => onReviewSignature(user)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border-none bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-text hover:underline [font-family:inherit]"
            >
              <Icon name="clock" size={12} />
              {t("signaturePendingBadge")}
            </button>
          ) : null;
          if (!url) {
            return (
              review ?? <span className="text-text-tertiary">{empty}</span>
            );
          }
          const title = t("signatureOf", {
            name: user.fullName || user.username,
          });
          const image = (
            <button
              type="button"
              title={title}
              aria-label={title}
              onClick={() => setPreview({ url, title })}
              className="inline-flex h-9 w-28 cursor-zoom-in items-center justify-center rounded-md border border-border-secondary bg-white px-1.5 transition hover:border-brand"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={title}
                className="max-h-full max-w-full object-contain"
              />
            </button>
          );
          return review ? (
            <div className="flex flex-col items-start gap-1">
              {image}
              {review}
            </div>
          ) : (
            image
          );
        },
      },
      {
        key: "roleName",
        header: t("role"),
        // Values travel as the stored English name; only the label is translated.
        filterLabel: (value) => labelOfName(value) || value,
        render: (_, user) => labelOfName(user.roleName) || empty,
      },
      {
        key: "department",
        header: t("department"),
        // Values travel as the stored English key; only the label is translated.
        filterLabel: (value) => departmentLabel(value) || empty,
        render: (value) => departmentLabel(value as string | null) || empty,
      },
      {
        key: "phone",
        header: t("phone"),
        defaultHidden: true,
        render: (value) => (value as string | null) || empty,
      },
      {
        key: "title",
        header: t("jobTitle"),
        defaultHidden: true,
        render: (value) => (value as string | null) || empty,
      },
      {
        key: "isActive",
        mobile: { role: "badge" },
        header: t("status"),
        // The column stores a boolean; the filter list must read as the cell does.
        filterLabel: (value) =>
          value === "true" ? t("statusActive") : t("statusInactive"),
        render: (_, user) => (
          <span
            className={
              user.isActive
                ? "inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success-text"
                : "inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-tertiary"
            }
          >
            <Icon name={user.isActive ? "circle-check" : "ban"} size={13} />
            {user.isActive ? t("statusActive") : t("statusInactive")}
          </span>
        ),
      },
      {
        key: "lastLoginAt",
        header: t("lastLoginAt"),
        // The filter lists the day, which is what an administrator picks an account by.
        filterLabel: (value) =>
          value
            ? new Date(`${value}T00:00:00`).toLocaleDateString(
                toIntlLocale(locale),
              )
            : t("neverSignedIn"),
        render: (value) =>
          value
            ? new Date(value as string).toLocaleString(toIntlLocale(locale))
            : empty,
      },
      {
        key: "actions",
        header: tCommon("tableColumns.actionsColumn"),
        filterable: false,
        sortable: false,
        className: "w-[150px]",
        render: (_, user) => (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEdit(user)}
              title={tCommon("edit")}
              aria-label={tCommon("edit")}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary text-text-secondary hover:bg-surface-secondary"
            >
              <Icon name="edit" size={14} />
            </button>
            {/* The API refuses an account deactivating itself, so its own row offers no
                control rather than one that always fails. */}
            {user.id !== currentUserId && (
              <button
                type="button"
                onClick={() => onToggleActive(user)}
                title={user.isActive ? t("deactivate") : t("activate")}
                aria-label={user.isActive ? t("deactivate") : t("activate")}
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary text-text-secondary hover:bg-surface-secondary"
              >
                <Icon name={user.isActive ? "ban" : "circle-check"} size={14} />
              </button>
            )}
            {/* Deleting yourself is refused by the API for the same reason deactivating is. */}
            {user.id !== currentUserId && (
              <button
                type="button"
                onClick={() => onDelete(user)}
                title={tCommon("delete")}
                aria-label={tCommon("delete")}
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary text-danger-text hover:bg-danger-bg"
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [
      t,
      tCommon,
      locale,
      empty,
      labelOfName,
      departmentLabel,
      currentUserId,
      onEdit,
      onToggleActive,
      onDelete,
      onReviewSignature,
    ],
  );

  return (
    <>
      <TableMobileCards>
        <Table
          columns={columns}
          data={data}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={onSelectionChange}
          selectionActions={selectionActions}
          // Deactivating your own account is refused by the API; do not offer it in a batch.
          isRowSelectable={(user) => user.id !== currentUserId}
          rowKey={(user) => String(user.id)}
          columnFilterEndpoint={adminUserApiRoutes.columnValues}
          columnPreferenceKey={USER_LIST_PREFERENCE_KEY}
          columnFilterParams={columnFilterParams}
          columnFilters={columnFilters}
          onColumnFiltersChange={onColumnFiltersChange}
          sort={sort}
          onSortChange={onSortChange}
        />
      </TableMobileCards>
      {preview && (
        <ImagePreviewModal
          imageUrl={preview.url}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
