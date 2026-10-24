import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_REQUIRED_SCOPES,
  canReadAnyNotification,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

const item = {
  eventType: "sales.request.assigned",
  message: "YC_2027_0001 — Panel line",
  payload: { code: "YC_2027_0001", title: "Panel line control cabinet" },
};

describe("sales request assignment notification", () => {
  it.each([
    ["vi", viCommon],
    ["en", enCommon],
  ] as const)("renders the request code and title in %s", (locale, common) => {
    const t = createTranslator({
      locale,
      messages: { common },
      namespace: "common.notification",
    });
    const message = resolveNotificationMessage(item);
    expect(message.kind).toBe("key");
    if (message.kind !== "key") return;

    const text = t(message.key as Parameters<typeof t>[0], message.values);
    expect(text).toContain("YC_2027_0001");
    expect(text).toContain("Panel line control cabinet");
    expect(text).not.toBe(t("fallbackMessage"));
  });

  it("shows the bell to an engineer, whose only relevant scope is request:read", () => {
    expect(NOTIFICATION_REQUIRED_SCOPES).toContain("request:read");
    expect(canReadAnyNotification(["request:read", "item:read"])).toBe(true);
    expect(canReadAnyNotification(["item:read"])).toBe(false);
  });
});
