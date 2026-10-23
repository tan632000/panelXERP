"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { ClassificationBadge } from "@/kernel/core/components/ui/ClassificationBadge";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { useDeleteConfirmation } from "@/kernel/core/hooks/useDeleteConfirmation";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";
import { isFrontendFeatureEnabled } from "@/kernel/platform/features/enabled-feature-keys";

import {
  useCustomerContacts,
  useDeleteContact,
} from "@plugins/crm/contact/hooks/api/useContact";
import { ContactPermission } from "@plugins/crm/contact/permissions/contact-permission.keys";

import { ContactFormModal } from "./ContactFormModal";

import type { Contact } from "@plugins/crm/contact/types";

const ACTION_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary transition-colors hover:bg-surface-secondary";

const PRIMARY_BADGE_CLASS = "bg-blue-50 text-blue-700 border-blue-200";

interface ContactSectionProps {
  customerId: number;
}

/** The contacts of one customer, with the add, edit and delete controls the actor may use. */
export function ContactSection({ customerId }: ContactSectionProps) {
  const t = useTranslations("contact");
  const tCommon = useTranslations("common");
  const { can } = useAuth();
  // The backend serves /contacts only while its `contact` feature is enabled.
  const featureEnabled = isFrontendFeatureEnabled("contact");
  const canRead = featureEnabled && can(ContactPermission.read);
  const canCreate = can(ContactPermission.create);
  const canUpdate = can(ContactPermission.update);
  const canDelete = can(ContactPermission.delete);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Contact | null>(null);

  const contactsQuery = useCustomerContacts(customerId, canRead);
  const deleteContact = useDeleteContact();
  useQueryErrorToast(contactsQuery.isError, t("toast.systemError"));

  const deleteConfirmation = useDeleteConfirmation<Contact>(
    (target, close) => deleteContact.mutate(target.id, { onSettled: close }),
  );

  const requestDelete = deleteConfirmation.request;
  const empty = t("emptyValue");
  const showActions = canUpdate || canDelete;

  const columns = useMemo(() => {
    const text = (value?: string | null) => value || empty;

    const base: Array<TableColumn<Contact>> = [
      {
        key: "name",
        header: t("name"),
        filterable: false,
        sortable: false,
        render: (_, item) => (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">{item.name}</span>
            {item.isPrimary && (
              <ClassificationBadge
                label={t("primary")}
                colorClass={PRIMARY_BADGE_CLASS}
              />
            )}
          </div>
        ),
      },
      {
        key: "position",
        header: t("position"),
        filterable: false,
        sortable: false,
        render: text,
      },
      {
        key: "phone",
        header: t("phone"),
        filterable: false,
        sortable: false,
        render: text,
      },
      {
        key: "email",
        header: t("email"),
        filterable: false,
        sortable: false,
        render: text,
      },
    ];

    if (!showActions) return base;

    return [
      ...base,
      {
        key: "actions",
        header: "",
        render: (_: unknown, item: Contact) => (
          <div className="flex gap-[3px]">
            {canUpdate && (
              <button
                type="button"
                className={`${ACTION_BUTTON} text-text-secondary hover:text-text-primary`}
                onClick={() => setEditTarget(item)}
                title={tCommon("edit")}
              >
                <Icon name="edit" size={15} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className={`${ACTION_BUTTON} text-danger-text hover:text-danger-text`}
                onClick={() => requestDelete(item)}
                title={tCommon("delete")}
              >
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [canDelete, canUpdate, empty, requestDelete, showActions, t, tCommon]);

  if (!canRead) return null;

  return (
    <>
      <DetailSection
        title={t("title")}
        action={
          canCreate ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(true)}
            >
              {t("addButton")}
            </Button>
          ) : undefined
        }
      >
        <Table
          columns={columns}
          data={contactsQuery.data?.data ?? []}
          rowKey={(item) => String(item.id)}
          emptyText={t("noItems")}
        />
      </DetailSection>

      <ContactFormModal
        isOpen={formOpen || editTarget !== null}
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
        }}
        customerId={customerId}
        contact={editTarget}
      />

      <ConfirmDialog
        open={deleteConfirmation.isOpen}
        onCancel={deleteConfirmation.cancel}
        onConfirm={deleteConfirmation.confirm}
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteDescription", {
          name: deleteConfirmation.target?.name ?? "",
        })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        pending={deleteContact.isPending}
      />
    </>
  );
}
