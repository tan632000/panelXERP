"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { QrCameraScanner } from "@/kernel/core/components/ui/QrCameraScanner";
import { resolveInAppQrPath } from "@/kernel/core/lib/qr-link";
import { useRouter } from "@/kernel/i18n/navigation";

/**
 * Header shortcut that opens the camera and follows a scanned in-app QR link in the current
 * tab, e.g. a receipt-line label straight to its detail screen for a quick issue. A QR that is
 * not a link into this app is reported over the camera, which keeps scanning. Shown even
 * without camera support: a QR saved as a photo can still be picked from the library.
 */
export function QrLinkScanButton() {
  const t = useTranslations("common.qrCamera");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejected, setRejected] = useState(false);

  const handleDecode = (text: string) => {
    const path = resolveInAppQrPath(text, window.location.origin);
    if (!path) {
      setRejected(true);
      return;
    }
    setOpen(false);
    router.push(path);
  };

  return (
    <>
      <button
        type="button"
        className="relative inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-text-primary hover:bg-surface-secondary"
        title={t("scanLink")}
        aria-label={t("scanLink")}
        onClick={() => {
          setRejected(false);
          setOpen(true);
        }}
      >
        <Icon name="qrcode" size={18} />
      </button>
      <QrCameraScanner
        isOpen={open}
        onClose={() => setOpen(false)}
        onDecode={handleDecode}
        title={t("scanLink")}
      >
        {rejected ? (
          <p
            role="status"
            className="rounded-md bg-surface-primary/95 px-3 py-2 text-center text-sm font-semibold text-danger-text"
          >
            {t("notAppLink")}
          </p>
        ) : null}
      </QrCameraScanner>
    </>
  );
}
