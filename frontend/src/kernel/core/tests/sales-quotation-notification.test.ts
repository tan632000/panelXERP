import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_EVENT_KEYS,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

const payload = {
  code: "03-25102026/BG",
  requestCode: "YC_2026_0001",
  ver: 2,
  reason: "Margin too thin",
};

describe("sales quotation notifications", () => {
  it.each([
    "sales.quotation.submitted",
    "sales.quotation.approved",
    "sales.quotation.rejected",
  ])("%s is an event this client phrases itself", (eventType) => {
    expect(NOTIFICATION_EVENT_KEYS).toContain(eventType);
  });

  it.each([
    ["vi", viCommon],
    ["en", enCommon],
  ] as const)("renders each event with its payload in %s", (locale, common) => {
    const t = createTranslator({
      locale,
      messages: { common },
      namespace: "common.notification",
    });
    const expected: Record<string, string[]> = {
      "sales.quotation.submitted": [payload.code, payload.requestCode, "2"],
      "sales.quotation.approved": [payload.code, payload.requestCode],
      "sales.quotation.rejected": [
        payload.code,
        payload.requestCode,
        payload.reason,
      ],
    };

    for (const [eventType, parts] of Object.entries(expected)) {
      const message = resolveNotificationMessage({
        eventType,
        message: "fallback",
        payload,
      });
      expect(message.kind).toBe("key");
      if (message.kind !== "key") return;

      const text = t(message.key as Parameters<typeof t>[0], message.values);
      for (const part of parts) expect(text).toContain(part);
      expect(text).not.toBe(t("fallbackMessage"));
    }
  });
});
