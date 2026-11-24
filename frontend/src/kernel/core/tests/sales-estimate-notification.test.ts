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

const aiFilledItem = {
  eventType: "sales.estimate.ai_filled",
  message: "DT_2027_0001 — YC_2027_0001",
  payload: {
    runId: 9,
    estimateId: 4,
    code: "DT_2027_0001",
    requestId: 5,
    requestCode: "YC_2027_0001",
  },
};

const aiFailedItem = {
  eventType: "sales.estimate.ai_failed",
  message: "YC_2027_0001 — AI_TIMEOUT",
  payload: { requestId: 5, requestCode: "YC_2027_0001", code: "AI_TIMEOUT" },
};

const LOCALES = [
  ["vi", viCommon],
  ["en", enCommon],
] as const;

function phrase(
  locale: "vi" | "en",
  common: typeof viCommon,
  notification: Parameters<typeof resolveNotificationMessage>[0],
) {
  const t = createTranslator({
    locale,
    messages: { common },
    namespace: "common.notification",
  });
  const message = resolveNotificationMessage(notification);
  expect(message.kind).toBe("key");
  if (message.kind !== "key") return "";
  const text = t(message.key as Parameters<typeof t>[0], message.values);
  expect(text).not.toBe(t("fallbackMessage"));
  return text;
}

describe("sales estimate submission notification", () => {
  it("is an event this client phrases itself", () => {
    expect(NOTIFICATION_EVENT_KEYS).toContain("sales.estimate.submitted");
  });

  it.each(LOCALES)(
    "renders the estimate code, request code and revision in %s",
    (locale, common) => {
      const text = phrase(locale, common, item);
      expect(text).toContain("DT_2027_0001");
      expect(text).toContain("YC_2027_0001");
      expect(text).toContain("2");
    },
  );
});

describe("sales estimate AI notifications", () => {
  it("are events this client phrases itself", () => {
    expect(NOTIFICATION_EVENT_KEYS).toContain("sales.estimate.ai_filled");
    expect(NOTIFICATION_EVENT_KEYS).toContain("sales.estimate.ai_failed");
  });

  it.each(LOCALES)(
    "names the draft and its request in %s",
    (locale, common) => {
      const text = phrase(locale, common, aiFilledItem);
      expect(text).toContain("DT_2027_0001");
      expect(text).toContain("YC_2027_0001");
    },
  );

  it.each(LOCALES)(
    "names the request of a failed run in %s",
    (locale, common) => {
      expect(phrase(locale, common, aiFailedItem)).toContain("YC_2027_0001");
    },
  );
});
