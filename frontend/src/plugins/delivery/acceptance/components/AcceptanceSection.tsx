"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { downloadBlob } from "@/kernel/core/lib/download-blob";
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import { isFrontendFeatureEnabled } from "@/kernel/platform/features/enabled-feature-keys";

import { useAcceptance } from "@plugins/delivery/acceptance/hooks/api/useAcceptance";
import { AcceptancePermission } from "@plugins/delivery/acceptance/permissions/acceptance-permission.keys";
import { fetchAcceptanceFile } from "@plugins/delivery/acceptance/services/acceptance.service";
import { useOrderInstallation } from "@plugins/delivery/installation/hooks/api/useInstallation";
import { InstallationPermission } from "@plugins/delivery/installation/permissions/installation-permission.keys";

import { AcceptanceUploadDialog } from "./AcceptanceUploadDialog";

import type { AcceptanceFile } from "@plugins/delivery/acceptance/types";

interface Props {
  orderId: number;
  orderStatus: string;
}

/**
 * The signed acceptance minutes of one order: read by `acceptance:read`, uploaded once by
 * `acceptance:create` while the order is delivered and its installation, if any, is done.
 */
export function AcceptanceSection({ orderId, orderStatus }: Readonly<Props>) {
  const t = useTranslations("delivery.acceptance");
  const tDelivery = useTranslations("delivery");
  const { can } = useAuth();
  const { showError } = useNotification();
  const acceptance = useAcceptance(orderId);
  // Without the right to read installations the server still decides, so none is assumed.
  const installationReadable =
    can(InstallationPermission.read) && isFrontendFeatureEnabled("installation");
  const installation = useOrderInstallation(orderId, installationReadable);
  const [uploading, setUploading] = useState(false);

  const minutes = acceptance.data;
  const canCreate = can(AcceptancePermission.create);
  const installationStatus = installation.data?.status;

  const download = (file: AcceptanceFile) =>
    fetchAcceptanceFile(file.id).then(
      (blob) => downloadBlob(blob, file.fileName),
      () => showError(tDelivery("toast.downloadFailed")),
    );

  let body: React.ReactNode;
  if (acceptance.isLoading || (installationReadable && installation.isLoading)) {
    body = <LoadingState variant="list" />;
  } else if (minutes) {
    body = (
      <div className="flex flex-col gap-3">
        <DetailFieldGrid columns={2}>
          <DetailField label={t("fields.representativeName")}>
            {minutes.representativeName}
          </DetailField>
          <DetailField label={t("fields.signedDate")}>
            {formatIsoDate(minutes.signedDate)}
          </DetailField>
        </DetailFieldGrid>
        <ul className="flex flex-col gap-2">
          {minutes.files.map((file) => (
            <li key={file.id}>
              <Button variant="secondary" onClick={() => download(file)}>
                {file.fileName}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (!canCreate) {
    body = <p className="text-sm text-text-secondary">{t("none")}</p>;
  } else if (orderStatus !== "delivered") {
    body = (
      <p className="text-sm text-text-secondary">{t("hints.notDelivered")}</p>
    );
  } else if (installationStatus && installationStatus !== "done") {
    body = (
      <p className="text-sm text-text-secondary">
        {t("hints.installationNotDone")}
      </p>
    );
  } else {
    body = <Button onClick={() => setUploading(true)}>{t("upload.open")}</Button>;
  }

  return (
    <DetailSection title={t("title")}>
      {body}
      {uploading ? (
        <AcceptanceUploadDialog
          orderId={orderId}
          onClose={() => setUploading(false)}
        />
      ) : null}
    </DetailSection>
  );
}
