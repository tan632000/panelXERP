"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import {
  DETAIL_ACTION_ROW_CLASS,
  DetailPanelActionButton,
} from "@/kernel/core/components/ui/DetailPanelActionButton";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";

import {
  REQUEST_ASSIGNABLE_STATUSES,
  REQUEST_CANCELLABLE_STATUSES,
  REQUEST_EDITABLE_STATUSES,
  REQUEST_LOSABLE_STATUSES,
  REQUEST_REASON_MAX,
  requestPageRoutes,
} from "@plugins/sales/request/constants";
import {
  useCancelRequest,
  useMarkRequestLost,
  useRequest,
} from "@plugins/sales/request/hooks/api/useRequest";
import { RequestPermission } from "@plugins/sales/request/permissions/request-permission.keys";
import { requestFeature } from "@plugins/sales/request/request.feature";

import { AssignRequestDialog } from "./AssignRequestDialog";
import { RequestDetailContent } from "./RequestDetailContent";
import { RequestFormModal } from "./RequestFormModal";

export function RequestDetailPage() {
  const t = useTranslations("request");
  const requestId = useEntityIdParam();
  const { can } = useAuth();

  const requestQuery = useRequest(requestId);
  const cancel = useCancelRequest();
  const markLost = useMarkRequestLost();

  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  const request = requestQuery.data;
  const listIcon = requestFeature.items[0]?.icon ?? "file-text";
  const isMissing =
    !requestId ||
    isNotFoundError(requestQuery.error) ||
    (!requestQuery.isLoading && !requestQuery.isError && !request);

  const listCrumb = {
    label: t("title"),
    href: requestPageRoutes.list,
    icon: listIcon,
  };
  const pageHeader = {
    pageTitle: t("title"),
    pageDescription: t("description"),
  };

  const fallback = (() => {
    if (requestId && requestQuery.isLoading) {
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
    if (requestQuery.isError || !request) {
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

  if (fallback || !request) {
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

  const canEdit =
    can(RequestPermission.update) &&
    REQUEST_EDITABLE_STATUSES.includes(request.status);
  const canAssign =
    can(RequestPermission.assign) &&
    REQUEST_ASSIGNABLE_STATUSES.includes(request.status);
  const canCancel =
    can(RequestPermission.cancel) &&
    REQUEST_CANCELLABLE_STATUSES.includes(request.status);
  const canMarkLost =
    can(RequestPermission.cancel) &&
    REQUEST_LOSABLE_STATUSES.includes(request.status);

  const reasonProps = {
    reasonLabel: t("reason.label"),
    placeholder: t("reason.placeholder"),
    requiredMessage: t("reason.required"),
    maxLengthMessage: t("reason.max", { max: REQUEST_REASON_MAX }),
    maxLength: REQUEST_REASON_MAX,
  };

  return (
    <>
      <DetailPageLayout
        {...pageHeader}
        breadcrumbs={[listCrumb, { label: request.code }]}
        title={request.title}
        subtitle={request.code}
        actions={
          <div className={DETAIL_ACTION_ROW_CLASS}>
            {canAssign ? (
              <DetailPanelActionButton
                icon="user-check"
                label={request.assignedEngineerId ? t("reassign") : t("assign")}
                onClick={() => setAssignOpen(true)}
              />
            ) : null}
            {canMarkLost ? (
              <DetailPanelActionButton
                variant="danger"
                icon="ban"
                label={t("markLost")}
                onClick={() => setLostOpen(true)}
              />
            ) : null}
            {canCancel ? (
              <DetailPanelActionButton
                variant="danger"
                icon="x"
                label={t("cancelRequest")}
                onClick={() => setCancelOpen(true)}
              />
            ) : null}
            {canEdit ? (
              <DetailPanelActionButton
                icon="edit"
                iconOnly
                aria-label={t("edit")}
                title={t("edit")}
                onClick={() => setEditOpen(true)}
              />
            ) : null}
          </div>
        }
      >
        <RequestDetailContent request={request} />
      </DetailPageLayout>

      <RequestFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        request={request}
      />

      <AssignRequestDialog
        isOpen={assignOpen}
        onClose={() => setAssignOpen(false)}
        requestId={request.id}
        currentEngineerId={request.assignedEngineerId}
      />

      <CancelReasonModal
        isOpen={cancelOpen}
        title={t("cancelTitle", { code: request.code })}
        description={t("cancelDescription")}
        submitLabel={t("cancelSubmit")}
        pending={cancel.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: request.id, data: { reason } },
            { onSuccess: () => setCancelOpen(false) },
          )
        }
        {...reasonProps}
      />

      <CancelReasonModal
        isOpen={lostOpen}
        title={t("lostTitle", { code: request.code })}
        description={t("lostDescription")}
        submitLabel={t("lostSubmit")}
        pending={markLost.isPending}
        onClose={() => setLostOpen(false)}
        onConfirm={(reason) =>
          markLost.mutate(
            { id: request.id, data: { reason } },
            { onSuccess: () => setLostOpen(false) },
          )
        }
        {...reasonProps}
      />
    </>
  );
}

export default RequestDetailPage;
