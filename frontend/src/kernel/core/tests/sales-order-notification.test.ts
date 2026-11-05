import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_EVENT_KEYS,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

import type { NotificationItem } from "@/kernel/core/hooks/api/useNotifications";

const tVi = createTranslator({
  locale: "vi",
  messages: { common: viCommon },
  namespace: "common.notification",
});
const tEn = createTranslator({
  locale: "en",
  messages: { common: enCommon },
  namespace: "common.notification",
});

type Translate = typeof tVi;

/** The sentence the bell shows; the stored message is a fallback the bundle must never need. */
function render(
  eventType: string,
  payload: Record<string, unknown>,
  t: Translate = tVi,
): string {
  const item: Pick<NotificationItem, "eventType" | "message" | "payload"> = {
    eventType,
    message: "STORED-MESSAGE",
    payload,
  };
  const message = resolveNotificationMessage(item);
  if (message.kind === "text") return message.text;
  return t(message.key as Parameters<Translate>[0], message.values);
}

const ORDER = { orderId: 7, code: "SO-0007", customerName: "ABC" };

const ORDER_CHANGES: ReadonlyArray<{
  change: string;
  extra: Record<string, unknown>;
  vi: string;
  en: string;
}> = [
  {
    change: "edited",
    extra: {},
    vi: "Đơn hàng SO-0007 vừa được chỉnh sửa.",
    en: "Order SO-0007 was edited.",
  },
  {
    change: "cancelled",
    extra: { reason: "Khách đổi ý" },
    vi: "Đơn hàng SO-0007 đã bị huỷ. Lý do: Khách đổi ý",
    en: "Order SO-0007 was cancelled. Reason: Khách đổi ý",
  },
  {
    change: "production_released",
    extra: { productionOrderCode: "LSX-12" },
    vi: "Đơn hàng SO-0007 đã được phát lệnh sản xuất LSX-12.",
    en: "Order SO-0007 was released to production as LSX-12.",
  },
  {
    change: "production_cancelled",
    extra: { productionOrderCode: "LSX-12", reason: "Thiếu vật tư" },
    vi: "Lệnh sản xuất LSX-12 của đơn hàng SO-0007 đã bị huỷ. Lý do: Thiếu vật tư",
    en: "Production order LSX-12 of order SO-0007 was cancelled. Reason: Thiếu vật tư",
  },
  {
    change: "production_completed",
    extra: { productionOrderCode: "LSX-12" },
    vi: "Lệnh sản xuất LSX-12 của đơn hàng SO-0007 đã hoàn thành.",
    en: "Production order LSX-12 of order SO-0007 is complete.",
  },
  {
    change: "stock_issued",
    extra: { issueCode: "PXK-5" },
    vi: "Đơn hàng SO-0007 vừa được xuất kho theo phiếu PXK-5.",
    en: "Order SO-0007 had stock issued on note PXK-5.",
  },
];

describe("sales order update notices", () => {
  it("lists both events as known to the bell", () => {
    const keys = NOTIFICATION_EVENT_KEYS as readonly string[];
    expect(keys).toContain("sales.order.updated");
    expect(keys).toContain("inventory.stocktake.approved");
  });

  it.each(ORDER_CHANGES)(
    "phrases the $change change in Vietnamese",
    ({ change, extra, vi }) => {
      expect(render("sales.order.updated", { ...ORDER, change, ...extra })).toBe(
        vi,
      );
    },
  );

  it.each(ORDER_CHANGES)(
    "phrases the $change change in English",
    ({ change, extra, en }) => {
      expect(
        render("sales.order.updated", { ...ORDER, change, ...extra }, tEn),
      ).toBe(en);
    },
  );

  it("phrases an unknown change generically with the order code", () => {
    const payload = { ...ORDER, change: "archived" };
    expect(render("sales.order.updated", payload)).toBe(
      "Đơn hàng SO-0007 vừa có thay đổi.",
    );
    expect(render("sales.order.updated", payload, tEn)).toBe(
      "Order SO-0007 was changed.",
    );
  });
});

describe("stocktake approved notice", () => {
  const payload = { stocktakeId: 3, code: "KK-0003" };

  it("names the count in Vietnamese", () => {
    expect(render("inventory.stocktake.approved", payload)).toBe(
      "Phiếu kiểm kê KK-0003 đã được duyệt, chênh lệch đã được ghi vào tồn kho.",
    );
  });

  it("names the count in English", () => {
    expect(render("inventory.stocktake.approved", payload, tEn)).toBe(
      "Stock count KK-0003 was approved and its differences were posted to stock.",
    );
  });
});
