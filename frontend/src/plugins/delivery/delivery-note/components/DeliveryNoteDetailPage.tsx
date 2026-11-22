"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import { displayDetailValue } from "@/kernel/core/lib/display-detail-value";
import { downloadBlob } from "@/kernel/core/lib/download-blob";
import { formatIsoDate, formatIsoDateTime } from "@/kernel/core/lib/formatters";
import { Link } from "@/kernel/i18n/navigation";

import {
  DELIVERY_NOTE_TEXT_MAX,
  deliveryNotePageRoutes,
} from "@plugins/delivery/delivery-note/constants";
import {
  useCancelDeliveryNote,
  useDeliveryNote,
  useShipDeliveryNote,
} from "@plugins/delivery/delivery-note/hooks/api/useDeliveryNote";
import { DeliveryNotePermission } from "@plugins/delivery/delivery-note/permissions/delivery-note-permission.keys";
import { fetchDeliveryNoteFile } from "@plugins/delivery/delivery-note/services/delivery-note.service";

import { DeliveryNoteReceiveDialog } from "./DeliveryNoteReceiveDialog";
import { DeliveryNoteStatusBadge } from "./DeliveryNoteStatusBadge";

import type { DeliveryNoteFile } from "@plugins/delivery/delivery-note/types";

const ICON = "truck";

/**
 * One delivery note: its cabinets, its handover files and the steps its status allows. A draft's
 * cabinets are never edited here; a wrong draft is cancelled and made again.
 */
export function DeliveryNoteDetailPage() {
  const t = useTranslations("delivery");
  const noteId = useEntityIdParam();
  const { can } = useAuth();
  const { showError } = useNotification();
  const query = useDeliveryNote(noteId);
  const ship = useShipDeliveryNote();
  const cancel = useCancelDeliveryNote();
  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const note = query.data;
  const listCrumb = {
    label: t("note.title"),
    href: deliveryNotePageRoutes.list,
    icon: ICON,
  };
  const header = {
    pageTitle: t("note.title"),
    pageDescription: t("note.description"),
  };

  if (!note) {
    const missing = !noteId || isNotFoundError(query.error) || query.isError;
    return (
      <DetailPageLayout
        {...header}
        breadcrumbs={[listCrumb, { label: t("note.detail.title") }]}
        title={t("note.detail.title")}
      >
        {missing ? (
          <EmptyState
            bordered={false}
            icon={ICON}
            message={t("note.detail.notFound")}
          />
        ) : (
          <LoadingState variant="list" />
        )}
      </DetailPageLayout>
    );
  }

  const empty = t("emptyValue");
  const value = (text?: string | null) => displayDetailValue(text, empty);
  const canShip = note.status === "draft" && can(DeliveryNotePermission.ship);
  const canReceive =
    note.status === "shipped" && can(DeliveryNotePermission.receive);
  const canCancel =
    (note.status === "draft" || note.status === "shipped") &&
    can(DeliveryNotePermission.cancel);

  const download = (file: DeliveryNoteFile) =>
    fetchDeliveryNoteFile(note.id, file.id).then(
      (blob) => downloadBlob(blob, file.fileName),
      () => showError(t("toast.downloadFailed")),
    );

  return (
    <DetailPageLayout
      {...header}
      breadcrumbs={[listCrumb, { label: note.code }]}
      title={note.code}
      actions={
        canShip || canReceive || canCancel ? (
          <div className="flex flex-wrap items-center gap-2">
            {canShip ? (
              <Button disabled={ship.isPending} onClick={() => ship.mutate(note.id)}>
                {t("note.actions.ship")}
              </Button>
            ) : null}
            {canReceive ? (
              <Button onClick={() => setReceiving(true)}>
                {t("note.actions.receive")}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="secondary"
                disabled={cancel.isPending}
                onClick={() => setCancelling(true)}
              >
                {t("note.actions.cancel")}
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <DetailSection title={t("note.detail.info")}>
        <DetailFieldGrid columns={2}>
          <DetailField label={t("note.columns.status")}>
            <DeliveryNoteStatusBadge status={note.status} />
          </DetailField>
          <DetailField label={t("note.columns.order")}>
            <Link
              className="font-mono text-brand underline"
              href={deliveryNotePageRoutes.order(note.orderId)}
            >
              {note.orderCode ?? t("emptyValue")}
            </Link>
          </DetailField>
          <DetailField label={t("note.columns.customer")}>
            {value(note.customerName)}
          </DetailField>
          <DetailField label={t("note.fields.project")}>
            {value(note.projectName)}
          </DetailField>
          <DetailField label={t("note.fields.plannedDate")}>
            {note.plannedDate ? formatIsoDate(note.plannedDate) : empty}
          </DetailField>
          <DetailField label={t("note.fields.shippedAt")}>
            {note.shippedAt ? formatIsoDateTime(note.shippedAt) : empty}
          </DetailField>
          <DetailField label={t("note.fields.address")} span2>
            {value(note.deliveryAddress)}
          </DetailField>
          <DetailField label={t("note.fields.note")} span2>
            {value(note.note)}
          </DetailField>
          {note.status === "received" ? (
            <>
              <DetailField label={t("note.receive.receiverName")}>
                {value(note.receiverName)}
              </DetailField>
              <DetailField label={t("note.columns.receivedDate")}>
                {note.receivedDate ? formatIsoDate(note.receivedDate) : empty}
              </DetailField>
            </>
          ) : null}
          {note.status === "cancelled" ? (
            <DetailField label={t("note.fields.cancelReason")} span2>
              {value(note.cancelReason)}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
      </DetailSection>

      <DetailSection title={t("note.detail.units")}>
        <ul className="flex flex-col gap-2">
          {note.units.map((unit) => (
            <li
              key={unit.unitId}
              className="rounded-[10px] border border-border-secondary p-2 font-mono text-sm"
            >
              {unit.code}
            </li>
          ))}
        </ul>
      </DetailSection>

      {note.files.length > 0 ? (
        <DetailSection title={t("note.detail.files")}>
          <ul className="flex flex-col gap-2">
            {note.files.map((file) => (
              <li key={file.id}>
                <Button variant="secondary" onClick={() => download(file)}>
                  {file.fileName}
                </Button>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {receiving ? (
        <DeliveryNoteReceiveDialog
          noteId={note.id}
          onClose={() => setReceiving(false)}
        />
      ) : null}
      <CancelReasonModal
        isOpen={cancelling}
        title={t("note.cancel.title", { code: note.code })}
        submitLabel={t("note.actions.cancel")}
        pending={cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: note.id, reason },
            { onSuccess: () => setCancelling(false) },
          )
        }
        reasonLabel={t("note.cancel.reason")}
        placeholder={t("note.cancel.placeholder")}
        requiredMessage={t("note.cancel.required")}
        maxLengthMessage={t("note.cancel.max", { max: DELIVERY_NOTE_TEXT_MAX })}
        maxLength={DELIVERY_NOTE_TEXT_MAX}
      />
    </DetailPageLayout>
  );
}
