import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { describe, expect, it } from "vitest";

import { useDeleteFailureReason } from "@/kernel/core/hooks/useDeleteFailureReason";
import viCommon from "@/kernel/langs/vi/common.json";

/** A feature's own delete-reason namespace and rules, standing in for a plugin's. */
const fixtureMessages = {
  toast: { deleteInUse: "Không thể xóa vì đang được sử dụng." },
};

function resolveFixtureDeleteToastKey(error: unknown): string | null {
  return JSON.stringify(error).includes("is referenced by")
    ? "deleteInUse"
    : null;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="vi"
      messages={{ common: viCommon, fixture: fixtureMessages }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

describe("useDeleteFailureReason", () => {
  it("reads a bulk refusal with the plugin's own delete rules", () => {
    const { result } = renderHook(
      () =>
        useDeleteFailureReason("fixture.toast", resolveFixtureDeleteToastKey),
      { wrapper },
    );

    const reason = result.current(
      "Cannot delete item because it is referenced by documents.",
    );

    expect(reason).toBe(fixtureMessages.toast.deleteInUse);
  });

  it("falls back to a generic reason rather than the raw backend wording", () => {
    const { result } = renderHook(
      () =>
        useDeleteFailureReason("fixture.toast", resolveFixtureDeleteToastKey),
      { wrapper },
    );

    const reason = result.current("some wording no rule matches");

    expect(reason).toBe(viCommon.bulkDelete.reasonUnknown);
  });

  it("gives the generic reason when a plugin has no delete rules", () => {
    const { result } = renderHook(
      () => useDeleteFailureReason("fixture.toast"),
      { wrapper },
    );

    expect(result.current("anything")).toBe(viCommon.bulkDelete.reasonUnknown);
  });
});
