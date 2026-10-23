import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { describe, expect, it } from "vitest";

import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { axiosErrorWithMessage } from "@/test/helpers/axios-error";

const NAMESPACE = "fixture.toast";
const fixtureToast = {
  forbidden: "Bạn không có quyền thực hiện thao tác này.",
  systemError: "Đã xảy ra lỗi hệ thống.",
  sameApproverForbidden: "Người duyệt phải khác người tạo.",
};

/** A feature's own rule for one business 403, standing in for a plugin's resolver. */
function resolveFixtureApproveError(error: unknown): string | undefined {
  return JSON.stringify(error).includes("someone other than")
    ? fixtureToast.sameApproverForbidden
    : undefined;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="vi"
      messages={{ fixture: { toast: fixtureToast } }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

describe("useToastMutationFeedback", () => {
  it("prefers the caller's own resolver over the generic forbidden message for a recognized 403", () => {
    const { result } = renderHook(
      () =>
        useToastMutationFeedback(NAMESPACE, {
          resolveMutationError: resolveFixtureApproveError,
        }),
      { wrapper },
    );

    const message = result.current.resolveErrorMessage(
      axiosErrorWithMessage(
        "The approval must be given by someone other than the creator.",
        403,
      ),
    );

    expect(message).toBe(fixtureToast.sameApproverForbidden);
    expect(message).not.toBe(fixtureToast.forbidden);
  });

  it("falls back to the generic forbidden message when no resolver recognizes the 403", () => {
    const { result } = renderHook(
      () =>
        useToastMutationFeedback(NAMESPACE, {
          resolveMutationError: resolveFixtureApproveError,
        }),
      { wrapper },
    );

    const message = result.current.resolveErrorMessage(
      axiosErrorWithMessage(
        "Approving this step requires the quotation:approve permission.",
        403,
      ),
    );

    expect(message).toBe(fixtureToast.forbidden);
  });

  it("returns undefined for a non-403 error no resolver recognizes, leaving the default error message", () => {
    const { result } = renderHook(() => useToastMutationFeedback(NAMESPACE), {
      wrapper,
    });

    const message = result.current.resolveErrorMessage(
      axiosErrorWithMessage("Something else went wrong.", 400),
    );

    expect(message).toBeUndefined();
    expect(result.current.errorMessage).toBe(fixtureToast.systemError);
  });
});
