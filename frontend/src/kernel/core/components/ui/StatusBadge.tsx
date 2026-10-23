"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/kernel/core/lib/cn";

const STATUS_STYLES: Record<string, { badgeClass: string; dotClass?: string }> =
  {
    current: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    potential: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    customer: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    active: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    expired: {
      badgeClass: "bg-danger-bg text-danger-text",
      dotClass: "bg-danger-text",
    },
    approaching: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    pending: {
      badgeClass: "bg-info-bg text-info-text",
      dotClass: "bg-info-text",
    },
    draft: {
      badgeClass: "bg-surface-secondary text-text-secondary",
    },
    finished: {
      badgeClass: "bg-info-bg text-info-text",
      dotClass: "bg-info-text",
    },
    semi: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    lost: {
      badgeClass: "bg-danger-bg text-danger-text",
      dotClass: "bg-danger-text",
    },
    won: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    inProgress: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    completed: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    delivered: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    shipped: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    processing: {
      badgeClass: "bg-info-bg text-info-text",
      dotClass: "bg-info-text",
    },
    pending_delivery: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    awaiting_qr_scan: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    dispatched: {
      badgeClass: "bg-info-bg text-info-text",
      dotClass: "bg-info-text",
    },
    delivery_success: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    cancelled: {
      badgeClass: "bg-danger-bg text-danger-text",
      dotClass: "bg-danger-text",
    },
    awaitingProcessing: {
      badgeClass: "bg-surface-secondary text-text-secondary",
    },
    received: {
      badgeClass: "bg-info-bg text-info-text",
      dotClass: "bg-info-text",
    },
    open: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    closed: {
      badgeClass: "bg-surface-secondary text-text-secondary",
    },
    stockSufficient: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
    stockShortageWithOrder: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    stockShortageNoOrder: {
      badgeClass: "bg-danger-bg text-danger-text",
      dotClass: "bg-danger-text",
    },
    // Scrap-request (NG-Huy) two-step approval flow.
    pendingQcApproval: {
      badgeClass: "bg-warning-bg text-warning-text",
      dotClass: "bg-warning-text",
    },
    pendingManagerApproval: {
      badgeClass: "bg-info-bg text-info-text",
      dotClass: "bg-info-text",
    },
    approved: {
      badgeClass: "bg-success-bg text-success-text",
      dotClass: "bg-success-text",
    },
  };

const STATUS_LABEL_KEYS: Record<string, string> = {
  current: "customer",
  potential: "potential",
  customer: "customer",
  active: "active",
  expired: "expired",
  approaching: "approaching",
  pending: "pending",
  draft: "draft",
  finished: "finished",
  semi: "semiFinished",
  lost: "lost",
  won: "won",
  inProgress: "inProgress",
  completed: "completed",
  delivered: "delivered",
  shipped: "shipped",
  processing: "processing",
  pending_delivery: "waitingDelivery",
  awaiting_qr_scan: "awaitingQrScan",
  dispatched: "dispatched",
  delivery_success: "deliverySuccess",
  cancelled: "cancelled",
  awaitingProcessing: "awaitingProcessing",
  received: "received",
  open: "open",
  closed: "closed",
  stockSufficient: "stockSufficient",
  stockShortageWithOrder: "stockShortageWithOrder",
  stockShortageNoOrder: "stockShortageNoOrder",
};

export function StatusBadge({
  status,
  label: labelOverride,
  size = "md",
}: {
  status: string;
  /** Localized label; when omitted, resolved from the `status` namespace. */
  label?: string;
  /** `sm` matches the compact pill used in dense table cells (e.g. the order list). */
  size?: "sm" | "md";
}) {
  const t = useTranslations("status");
  const labelKey = STATUS_LABEL_KEYS[status];
  const label = labelOverride ?? (labelKey ? t(labelKey) : status);

  const style = STATUS_STYLES[status];
  const badgeClass =
    style?.badgeClass ?? "bg-surface-secondary text-text-secondary";
  const dotClass = style?.dotClass;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[3px] whitespace-nowrap rounded-full font-bold",
        size === "sm"
          ? "px-[7px] py-[2px] text-[10px]"
          : "px-2 py-0.5 text-[13px]",
        badgeClass,
      )}
      aria-label={label}
    >
      {dotClass && (
        <span
          className={cn("inline-block h-[5px] w-[5px] rounded-full", dotClass)}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}
