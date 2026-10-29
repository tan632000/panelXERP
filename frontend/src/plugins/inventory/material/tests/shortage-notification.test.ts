import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_REQUIRED_SCOPES,
  canReadAnyNotification,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

const payload = {
  orderId: 4,
  code: "DH_2026_0001",
  customerName: "Công ty Điện Nam",
  shortItemCount: 2,
};

describe("order shortage notifications", () => {
  it("are events this client phrases itself", () => {
    expect(NOTIFICATION_EVENT_KEYS).toEqual(
      expect.arrayContaining([
        "inventory.order.short",
        "inventory.order.short.owner",
      ]),
    );
  });

  it("reach purchasing and the sales owner through the material scope", () => {
    expect(NOTIFICATION_REQUIRED_SCOPES).toContain("material:read");
    expect(canReadAnyNotification(["material:read"])).toBe(true);
  });

  it.each([
    ["vi", viCommon],
    ["en", enCommon],
  ] as const)(
    "render the order and how many items it lacks in %s",
    (locale, common) => {
      const t = createTranslator({
        locale,
        messages: { common },
        namespace: "common.notification",
      });

      for (const eventType of [
        "inventory.order.short",
        "inventory.order.short.owner",
      ]) {
        const message = resolveNotificationMessage({
          eventType,
          message: "fallback",
          payload,
        });
        expect(message.kind).toBe("key");
        if (message.kind !== "key") return;
        const text = t(message.key as Parameters<typeof t>[0], message.values);
        expect(text).toContain("DH_2026_0001");
        expect(text).toContain("2");
        expect(text).not.toBe(t("fallbackMessage"));
      }
    },
  );
});
