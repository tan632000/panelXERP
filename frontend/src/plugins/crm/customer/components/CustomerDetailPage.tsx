"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailPanelActions } from "@/kernel/core/components/ui/DetailPanelActions";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useDeleteConfirmation } from "@/kernel/core/hooks/useDeleteConfirmation";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { useRouter } from "@/kernel/i18n/navigation";

import { customerPageRoutes } from "@plugins/crm/customer/constants";
import { customerFeature } from "@plugins/crm/customer/customer.feature";
import {
  useCustomer,
  useDeleteCustomer,
} from "@plugins/crm/customer/hooks/api/useCustomer";
import { CustomerPermission } from "@plugins/crm/customer/permissions/customer-permission.keys";

import { CustomerDetailContent } from "./CustomerDetailContent";
import { EditCustomerModal } from "./EditCustomerModal";

export function CustomerDetailPage() {
  const t = useTranslations("customer");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const customerId = useEntityIdParam();

  const customerQuery = useCustomer(customerId);
  const deleteCustomer = useDeleteCustomer();

  const [editOpen, setEditOpen] = useState(false);

  const deleteConfirmation = useDeleteConfirmation<{
    id: number;
    code: string;
    name: string;
  }>((target, close) =>
    deleteCustomer.mutate(target.id, {
      onSettled: close,
      onSuccess: () => {
        router.push(customerPageRoutes.list);
      },
    }),
  );

  const customer = customerQuery.data;
  const listIcon = customerFeature.items[0]?.icon ?? "users";
  const isMissing =
    !customerId ||
    isNotFoundError(customerQuery.error) ||
    (!customerQuery.isLoading && !customerQuery.isError && !customer);

  const listCrumb = {
    label: t("title"),
    href: customerPageRoutes.list,
    icon: listIcon,
  };
  const pageHeader = {
    pageTitle: t("title"),
    pageDescription: t("description"),
  };

  const fallback = (() => {
    if (customerId && customerQuery.isLoading) {
      return <LoadingState variant="list" />;
    }
    if (isMissing) {
      return (
        <EmptyState
          bordered={false}
          icon={listIcon}
          message={t("detailNotFound")}
        />
      );
    }
    if (customerQuery.isError || !customer) {
      return (
        <EmptyState
          bordered={false}
          icon="alert"
          message={t("toast.systemError")}
        />
      );
    }
    return null;
  })();

  if (fallback || !customer) {
    return (
      <DetailPageLayout
        {...pageHeader}
        breadcrumbs={[listCrumb, { label: t("detailTitle") }]}
        title={t("detailTitle")}
      >
        {fallback}
      </DetailPageLayout>
    );
  }

  return (
    <>
      <DetailPageLayout
        {...pageHeader}
        breadcrumbs={[listCrumb, { label: customer.name }]}
        title={customer.name}
        subtitle={customer.code}
        actions={
          <DetailPanelActions
            onEdit={() => setEditOpen(true)}
            onDelete={() => deleteConfirmation.request(customer)}
            writePermission={CustomerPermission.update}
            deletePermission={CustomerPermission.delete}
          />
        }
      >
        <CustomerDetailContent customer={customer} />
      </DetailPageLayout>

      <EditCustomerModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
      />

      <ConfirmDialog
        open={deleteConfirmation.isOpen}
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteDescription", {
          code: deleteConfirmation.target?.code ?? "",
          name: deleteConfirmation.target?.name ?? "",
        })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onCancel={deleteConfirmation.cancel}
        onConfirm={deleteConfirmation.confirm}
        pending={deleteCustomer.isPending}
      />
    </>
  );
}
