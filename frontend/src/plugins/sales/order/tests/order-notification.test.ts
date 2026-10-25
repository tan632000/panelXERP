import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_EVENT_KEYS,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

const payload = {
  code: "DH_2026_0001",
  quotationCode: "01-25102026/BG",
  requestCode: "YC_2026_0001",
};

describe("sales order notification", () => {
  it("is an event this client phrases itself", () => {
    expect(NOTIFICATION_EVENT_KEYS).toContain("sales.order.created");
  });

  it.each([
    ["vi", viCommon],
    ["en", enCommon],
  ] as const)(
    "renders the new order with its payload in %s",
    (locale, common) => {
      const t = createTranslator({
        locale,
        messages: { common },
        namespace: "common.notification",
      });

      const message = resolveNotificationMessage({
        eventType: "sales.order.created",
        message: "fallback",
        payload,
      });

      expect(message.kind).toBe("key");
      if (message.kind !== "key") return;
      const text = t(message.key as Parameters<typeof t>[0], message.values);
      for (const part of Object.values(payload)) expect(text).toContain(part);
      expect(text).not.toBe(t("fallbackMessage"));
    },
  );
});
