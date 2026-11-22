"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { displayDetailValue } from "@/kernel/core/lib/display-detail-value";
import { formatIsoDate } from "@/kernel/core/lib/formatters";

import { INSTALLABLE_ORDER_STATUSES } from "@plugins/delivery/installation/constants";
import {
  useFinishInstallation,
  useOrderInstallation,
  useStartInstallation,
} from "@plugins/delivery/installation/hooks/api/useInstallation";
import { InstallationPermission } from "@plugins/delivery/installation/permissions/installation-permission.keys";

import { InstallationCreateDialog } from "./InstallationCreateDialog";
import { InstallationPhotos } from "./InstallationPhotos";
import { InstallationStatusBadge } from "./InstallationStatusBadge";

interface Props {
  orderId: number;
  orderStatus: string;
  /** The order's project site (else customer) address a new installation starts with. */
  siteAddress: string | null;
}

/**
 * The installation of one order at the project site: planned, started and finished by whoever
 * holds `installation:manage`, with its photos. An order has at most one and it is never cancelled.
 */
export function InstallationSection({
  orderId,
  orderStatus,
  siteAddress,
}: Readonly<Props>) {
  const t = useTranslations("delivery.installation");
  const tRoot = useTranslations("delivery");
  const canManage = useAuth().can(InstallationPermission.manage);
  const query = useOrderInstallation(orderId);
  const start = useStartInstallation();
  const finish = useFinishInstallation();
  const [creating, setCreating] = useState(false);

  const installation = query.data;
  const installable = (INSTALLABLE_ORDER_STATUSES as readonly string[]).includes(
    orderStatus,
  );
  const empty = tRoot("emptyValue");
  const value = (text?: string | null) => displayDetailValue(text, empty);

  let body: React.ReactNode;
  if (query.isLoading) {
    body = <LoadingState variant="list" />;
  } else if (!installation) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-text-secondary">{t("none")}</p>
        {canManage && installable ? (
          <Button onClick={() => setCreating(true)}>{t("create.open")}</Button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <DetailFieldGrid columns={2}>
          <DetailField label={t("fields.status")}>
            <InstallationStatusBadge status={installation.status} />
          </DetailField>
          <DetailField label={t("fields.plannedDate")}>
            {installation.plannedDate
              ? formatIsoDate(installation.plannedDate)
              : empty}
          </DetailField>
          <DetailField label={t("fields.siteAddress")} span2>
            {value(installation.siteAddress)}
          </DetailField>
          <DetailField label={t("fields.personInCharge")}>
            {value(installation.personInCharge)}
          </DetailField>
          <DetailField label={t("fields.note")} span2>
            {value(installation.note)}
          </DetailField>
        </DetailFieldGrid>
        {canManage &&
        (installation.status === "planned" ||
          installation.status === "in_progress") ? (
          <div className="flex flex-wrap items-center gap-2">
            {installation.status === "planned" ? (
              <Button
                disabled={start.isPending}
                onClick={() => start.mutate(installation.id)}
              >
                {t("actions.start")}
              </Button>
            ) : (
              <Button
                disabled={finish.isPending}
                onClick={() => finish.mutate(installation.id)}
              >
                {t("actions.finish")}
              </Button>
            )}
          </div>
        ) : null}
        <InstallationPhotos
          installationId={installation.id}
          photos={installation.photos}
          canUpload={canManage}
        />
      </div>
    );
  }

  return (
    <DetailSection title={t("title")}>
      {body}
      {creating ? (
        <InstallationCreateDialog
          orderId={orderId}
          siteAddress={siteAddress}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </DetailSection>
  );
}
