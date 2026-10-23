"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import api from "@/kernel/core/api/api";
import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { toIntlLocale } from "@/kernel/i18n/locale";

import type { MeResponse } from "@/kernel/core/auth/types";

const FRAME =
  "flex h-32 w-full items-center justify-center rounded-lg border bg-white p-3";

const CORNER_BUTTON =
  "absolute right-2 top-2 inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary text-text-tertiary transition hover:border-danger-text hover:bg-danger-bg hover:text-danger-text disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The account's electronic signature, as printed documents will stamp it. Updating it is the
 * panel header's action; the empty frame offers the same thing so a first signature is one
 * click away.
 *
 * A signature submitted for review shows beside the current one until an administrator
 * decides; a rejection shows its reason until the next submission.
 */
export function ProfileSignature({
  signatureUrl,
  pendingSignatureUrl,
  signatureRequestedAt,
  signatureRejectionReason,
  onAdd,
}: {
  signatureUrl?: string | null;
  pendingSignatureUrl?: string | null;
  signatureRequestedAt?: string | null;
  signatureRejectionReason?: string | null;
  onAdd: () => void;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const { applySessionUpdate } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [busy, setBusy] = useState(false);

  const send = async (route: string, successMessage: string) => {
    setBusy(true);
    try {
      const { data } = await api.delete<MeResponse>(route);
      applySessionUpdate(data);
      showSuccess(successMessage);
    } catch {
      showError(t("requestFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {signatureRejectionReason && !pendingSignatureUrl && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-xs leading-5 text-danger-text">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {t("signature.rejected", { reason: signatureRejectionReason })}
        </p>
      )}
      {signatureUrl ? (
        <div className={`group relative border-border-secondary ${FRAME}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureUrl}
            alt={t("signature.alt")}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={() =>
              void send(apiRoutes.auth.signature, t("signature.removed"))
            }
            disabled={busy}
            title={t("signature.remove")}
            aria-label={t("signature.remove")}
            className={CORNER_BUTTON}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      ) : (
        !pendingSignatureUrl && (
          <button
            type="button"
            onClick={onAdd}
            className={`cursor-pointer flex-col gap-1.5 border-dashed border-border-secondary text-sm text-text-tertiary transition-colors hover:border-brand hover:text-brand [font-family:inherit] ${FRAME}`}
          >
            <Icon name="signature" size={22} />
            {t("signature.empty")}
          </button>
        )
      )}
      {pendingSignatureUrl && (
        <div className={signatureUrl ? "mt-4" : undefined}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning-text">
              <Icon name="clock" size={13} />
              {t("signature.pendingBadge")}
            </span>
            {signatureRequestedAt && (
              <span className="text-xs text-text-tertiary">
                {t("signature.requestedAt", {
                  time: new Date(signatureRequestedAt).toLocaleString(
                    toIntlLocale(locale),
                  ),
                })}
              </span>
            )}
          </div>
          <div
            className={`relative border-dashed border-warning-text ${FRAME}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingSignatureUrl}
              alt={t("signature.pendingAlt")}
              className="max-h-full max-w-full object-contain"
            />
            <button
              type="button"
              onClick={() =>
                void send(
                  apiRoutes.auth.signatureRequest,
                  t("signature.withdrawn"),
                )
              }
              disabled={busy}
              title={t("signature.withdraw")}
              aria-label={t("signature.withdraw")}
              className={CORNER_BUTTON}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-text-tertiary">
            {t("signature.pendingHint")}
          </p>
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-text-tertiary">
        {t("signature.hint")}
      </p>
    </>
  );
}
