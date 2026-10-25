import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_EVENT_KEYS,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

const item = {
  eventType: "sales.estimate.submitted",
  message: "DT_2027_0001 — YC_2027_0001",
  payload: {
    code: "DT_2027_0001",
    requestCode: "YC_2027_0001",
    revision: 2,
  },
};

describe("sales estimate submission notification", () => {
  it("is an event this client phrases itself", () => {
    expect(NOTIFICATION_EVENT_KEYS).toContain("sales.estimate.submitted");
  });

  it.each([
    ["vi", viCommon],
    ["en", enCommon],
  ] as const)(
    "renders the estimate code, request code and revision in %s",
    (locale, common) => {
      const t = createTranslator({
        locale,
        messages: { common },
        namespace: "common.notification",
      });
      const message = resolveNotificationMessage(item);
      expect(message.kind).toBe("key");
      if (message.kind !== "key") return;

      const text = t(message.key as Parameters<typeof t>[0], message.values);
      expect(text).toContain("DT_2027_0001");
      expect(text).toContain("YC_2027_0001");
      expect(text).toContain("2");
      expect(text).not.toBe(t("fallbackMessage"));
    },
  );
});
