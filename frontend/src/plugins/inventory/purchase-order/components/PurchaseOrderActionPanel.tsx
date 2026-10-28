"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";

import { PURCHASE_ORDER_REASON_MAX } from "@plugins/inventory/purchase-order/constants";
import { usePurchaseOrderAction } from "@plugins/inventory/purchase-order/hooks/api/usePurchaseOrder";
import { purchaseOrderActions } from "@plugins/inventory/purchase-order/utils/purchase-order-actions";

import type { PurchaseOrderDetail } from "@plugins/inventory/purchase-order/types";

type Dialog = "submit" | "approve" | "reject" | "cancel" | "close" | null;

/**
 * What the reader can do with the order next. Approve and Reject are withheld from whoever
 * created, submitted or edited the order, whom the server refuses anyway.
 */
export function PurchaseOrderActionPanel({
  order,
}: {
  order: PurchaseOrderDetail;
}) {
  const t = useTranslations("purchaseOrder.actions");
  const tCommon = useTranslations("common");
  const { can, user } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);

  const submit = usePurchaseOrderAction(order.id, "submit");
  const approve = usePurchaseOrderAction(order.id, "approve");
  const reject = usePurchaseOrderAction(order.id, "reject");
  const cancel = usePurchaseOrderAction(order.id, "cancel");
  const close = usePurchaseOrderAction(order.id, "close");
  const busy = [submit, approve, reject, cancel, close].some(
    (mutation) => mutation.isPending,
  );

  const allowed = purchaseOrderActions(order, can, user?.id);
  const closeDialog = () => setDialog(null);
  const reasonProps = {
    reasonLabel: t("reason.label"),
    placeholder: t("reason.placeholder"),
    requiredMessage: t("reason.required"),
    maxLengthMessage: t("reason.max", { max: PURCHASE_ORDER_REASON_MAX }),
    maxLength: PURCHASE_ORDER_REASON_MAX,
  };

  return (
    <>
      <DetailSection title={t("title")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {t(`hint.${order.status}`)}
          </p>
          {allowed.decideBarred ? (
            <p className="text-sm text-text-secondary">
              {t("involvedCannotDecide")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {allowed.submit ? (
              <DetailPanelActionButton
                variant="primary"
                icon="check"
                label={t("submit")}
                disabled={busy}
                onClick={() => setDialog("submit")}
              />
            ) : null}
            {allowed.decide ? (
              <>
                <DetailPanelActionButton
                  variant="primary"
                  icon="circle-check"
                  label={t("approve")}
                  disabled={busy}
                  onClick={() => setDialog("approve")}
                />
                <DetailPanelActionButton
                  variant="danger"
                  icon="circle-x"
                  label={t("reject")}
                  disabled={busy}
                  onClick={() => setDialog("reject")}
                />
              </>
            ) : null}
            {allowed.close ? (
              <DetailPanelActionButton
                icon="lock"
                label={t("close")}
                disabled={busy}
                onClick={() => setDialog("close")}
              />
            ) : null}
            {allowed.cancel ? (
              <DetailPanelActionButton
                variant="danger"
                icon="ban"
                label={t("cancel")}
                disabled={busy}
                onClick={() => setDialog("cancel")}
              />
            ) : null}
          </div>
        </div>
      </DetailSection>

      <ConfirmDialog
        open={dialog === "submit"}
        variant="default"
        icon="check"
        title={t("submitTitle", { code: order.code })}
        description={t("submitDescription")}
        confirmLabel={t("submit")}
        cancelLabel={tCommon("cancel")}
        pending={submit.isPending}
        onCancel={closeDialog}
        onConfirm={() => submit.mutate(undefined, { onSettled: closeDialog })}
      />
      <ConfirmDialog
        open={dialog === "approve"}
        variant="default"
        icon="circle-check"
        title={t("approveTitle", { code: order.code })}
        description={t("approveDescription")}
        confirmLabel={t("approve")}
        cancelLabel={tCommon("cancel")}
        pending={approve.isPending}
        onCancel={closeDialog}
        onConfirm={() => approve.mutate(undefined, { onSettled: closeDialog })}
      />
      <CancelReasonModal
        isOpen={dialog === "reject"}
        title={t("rejectTitle", { code: order.code })}
        description={t("rejectDescription")}
        submitLabel={t("reject")}
        pending={reject.isPending}
        onClose={closeDialog}
        onConfirm={(reason) =>
          reject.mutate(reason, { onSuccess: closeDialog })
        }
        {...reasonProps}
      />
      <CancelReasonModal
        isOpen={dialog === "cancel"}
        title={t("cancelTitle", { code: order.code })}
        submitLabel={t("cancel")}
        pending={cancel.isPending}
        onClose={closeDialog}
        onConfirm={(reason) =>
          cancel.mutate(reason, { onSuccess: closeDialog })
        }
        {...reasonProps}
      />
      <CancelReasonModal
        isOpen={dialog === "close"}
        title={t("closeTitle", { code: order.code })}
        description={t("closeDescription")}
        submitLabel={t("close")}
        pending={close.isPending}
        onClose={closeDialog}
        onConfirm={(reason) => close.mutate(reason, { onSuccess: closeDialog })}
        {...reasonProps}
      />
    </>
  );
}
