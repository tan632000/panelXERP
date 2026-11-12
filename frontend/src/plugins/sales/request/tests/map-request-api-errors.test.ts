import { describe, expect, it } from "vitest";

import viRequest from "@/kernel/langs/vi/request.json";

import { axiosErrorWithMessage } from "@/test/helpers/axios-error";

import { resolveRequestToastKey } from "@plugins/sales/request/utils/map-request-api-errors";

describe("resolveRequestToastKey", () => {
  it("names the missing brief when an assignment is refused for it", () => {
    const error = axiosErrorWithMessage(
      "A request needs technical requirements or an attachment before it is assigned.",
    );
    expect(resolveRequestToastKey(error)).toBe("assignBriefMissing");
    expect(viRequest.toast.assignBriefMissing).toBe(
      "Cần nhập yêu cầu kỹ thuật hoặc đính kèm ít nhất 1 tài liệu trước khi phân công kỹ sư.",
    );
  });

  it("keeps the general state message for a request that can no longer be assigned", () => {
    const error = axiosErrorWithMessage(
      "A request estimated can no longer be assigned.",
    );
    expect(resolveRequestToastKey(error)).toBe("statusConflict");
  });
});
