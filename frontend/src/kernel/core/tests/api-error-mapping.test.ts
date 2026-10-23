import { describe, expect, it } from "vitest";

import { shouldSuppressInlineFormErrorToast } from "@/kernel/core/lib/api-error-mapping";

import { axiosErrorWithMessage } from "@/test/helpers/axios-error";

describe("shouldSuppressInlineFormErrorToast", () => {
  it("suppresses duplicate code conflicts mapped to form fields", () => {
    expect(
      shouldSuppressInlineFormErrorToast(
        axiosErrorWithMessage("Material code already exists.", 409),
      ),
    ).toBe(true);
  });

  it("suppresses structured validation field errors", () => {
    expect(
      shouldSuppressInlineFormErrorToast({
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            errors: [{ field: "code", message: "Code is required." }],
          },
        },
      }),
    ).toBe(true);
  });

  it("keeps forbidden errors toastable", () => {
    expect(
      shouldSuppressInlineFormErrorToast(
        axiosErrorWithMessage("Forbidden", 403),
      ),
    ).toBe(false);
  });

  it("suppresses an expired-session 401 — AuthContext's global listener owns that toast", () => {
    expect(
      shouldSuppressInlineFormErrorToast(
        axiosErrorWithMessage("Unauthorized", 401),
      ),
    ).toBe(true);
  });

  it("keeps delete blockers toastable", () => {
    expect(
      shouldSuppressInlineFormErrorToast(
        axiosErrorWithMessage(
          "Cannot delete product because customer product data still references it.",
          400,
        ),
      ),
    ).toBe(false);
  });

  it("keeps a delete blocker toastable when it arrives as a 409", () => {
    // The mold guard refuses with a conflict, not a bad request. Judging by status alone
    // read that as a taken value and dropped it, leaving the confirm dialog to close on
    // no toast at all — neither the success nor the reason the delete was refused.
    expect(
      shouldSuppressInlineFormErrorToast(
        axiosErrorWithMessage(
          "Cannot delete mold because it is referenced by internal products.",
          409,
        ),
      ),
    ).toBe(false);
    expect(
      shouldSuppressInlineFormErrorToast(
        axiosErrorWithMessage(
          "Cannot delete mold because it is referenced by business documents.",
          409,
        ),
      ),
    ).toBe(false);
  });

  it("still suppresses a duplicate named without the conflict status", () => {
    expect(
      shouldSuppressInlineFormErrorToast(
        axiosErrorWithMessage("Duplicate product selected.", 400),
      ),
    ).toBe(true);
  });
});
