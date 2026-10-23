"use client";

import { useLocale, useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { toIntlLocale } from "@/kernel/i18n/locale";

import { SIGNATURE_REJECTION_REASON_MAX_LENGTH } from "@plugins/system/users/constants";
import {
  useApproveAdminUserSignature,
  useRejectAdminUserSignature,
} from "@plugins/system/users/hooks/api/useAdminUsers";

import type { AdminUser } from "@plugins/system/users/types";

/** One signature laid on white, the way it prints. */
function SignatureFrame({
  label,
  url,
  emptyLabel,
  highlight,
}: {
  label: string;
  url?: string | null;
  emptyLabel: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <div
        className={
          highlight
            ? "flex h-36 items-center justify-center rounded-lg border-2 border-dashed border-warning-text bg-white p-3"
            : "flex h-36 items-center justify-center rounded-lg border border-border-secondary bg-white p-3"
        }
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-sm text-text-tertiary">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

/**
 * An administrator's decision on a signature an account submitted: approve it, so documents
 * start printing it, or reject it with a reason its holder reads on their profile.
 */
export function SignatureReviewModal({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const t = useTranslations("system.users");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const approve = useApproveAdminUserSignature();
  const reject = useRejectAdminUserSignature();
  const [rejecting, setRejecting] = useState(false);
  const name = user.fullName || user.username;
  const pending = approve.isPending || reject.isPending;

  return (
    <>
      <Modal
        isOpen={!rejecting}
        wide
        onClose={onClose}
        title={t("signatureReviewTitle", { name })}
        showFooter={false}
      >
        {user.pendingSignatureUrl ? (
          <>
            {user.signatureRequestedAt && (
              <p className="mb-3 text-sm text-text-secondary">
                {t("signatureRequestedAt", {
                  time: new Date(user.signatureRequestedAt).toLocaleString(
                    toIntlLocale(locale),
                  ),
                })}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <SignatureFrame
                label={t("signatureCurrent")}
                url={user.signatureUrl}
                emptyLabel={t("signatureNone")}
              />
              <SignatureFrame
                label={t("signaturePending")}
                url={user.pendingSignatureUrl}
                emptyLabel={t("signatureNone")}
                highlight
              />
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-border-secondary pt-3">
              <Button variant="secondary" onClick={onClose}>
                {tCommon("cancel")}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setRejecting(true)}
                className="text-danger-text"
              >
                <Icon name="circle-x" size={16} />
                {t("signatureReject")}
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  approve.mutate(user.id, { onSuccess: () => onClose() })
                }
              >
                <Icon name="check" size={16} />
                {t("signatureApprove")}
              </Button>
            </div>
          </>
        ) : (
          // Opened from a stale notification: someone already decided, or the holder withdrew.
          <p className="text-sm text-text-secondary">
            {t("signatureNothingPending")}
          </p>
        )}
      </Modal>

      <CancelReasonModal
        isOpen={rejecting}
        title={t("signatureRejectTitle", { name })}
        reasonLabel={t("signatureRejectReason")}
        placeholder={t("placeholders.signatureRejectReason")}
        submitLabel={t("signatureReject")}
        requiredMessage={t("signatureRejectReasonRequired")}
        maxLengthMessage={t("signatureRejectReasonTooLong", {
          max: SIGNATURE_REJECTION_REASON_MAX_LENGTH,
        })}
        maxLength={SIGNATURE_REJECTION_REASON_MAX_LENGTH}
        pending={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate({ id: user.id, reason }, { onSuccess: () => onClose() })
        }
      />
    </>
  );
}
