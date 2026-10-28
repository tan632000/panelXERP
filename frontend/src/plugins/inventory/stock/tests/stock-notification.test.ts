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
  itemId: 7,
  code: "VT-0007",
  name: "Aptomat 3P 100A",
  unit: "Cái",
  available: 11,
  minStock: 12,
};

describe("low-stock notification", () => {
  it("is an event this client phrases itself", () => {
    expect(NOTIFICATION_EVENT_KEYS).toContain("inventory.stock.low");
  });

  it("gives purchasing a bell through the stock list scope", () => {
    expect(NOTIFICATION_REQUIRED_SCOPES).toContain("stock:read");
    expect(canReadAnyNotification(["stock:read"])).toBe(true);
  });

  it.each([
    ["vi", viCommon],
    ["en", enCommon],
  ] as const)("renders the item and its shortfall in %s", (locale, common) => {
    const t = createTranslator({
      locale,
      messages: { common },
      namespace: "common.notification",
    });

    const message = resolveNotificationMessage({
      eventType: "inventory.stock.low",
      message: "fallback",
      payload,
    });

    expect(message.kind).toBe("key");
    if (message.kind !== "key") return;
    const text = t(message.key as Parameters<typeof t>[0], message.values);
    for (const part of ["VT-0007", "Aptomat 3P 100A", "Cái", "11", "12"]) {
      expect(text).toContain(part);
    }
    expect(text).not.toBe(t("fallbackMessage"));
  });
});
