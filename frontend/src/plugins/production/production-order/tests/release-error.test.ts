import { describe, expect, it } from "vitest";

import { unitCodesFromReleaseError } from "@plugins/production/production-order/utils/release-error";

/** A 400 in the envelope the API's exception filter answers with. */
function badRequest(message: string) {
  return {
    isAxiosError: true,
    response: {
      status: 400,
      data: { statusCode: 400, error: { message } },
    },
  };
}

describe("unitCodesFromReleaseError", () => {
  it("keeps a tag that holds a colon or a comma whole", () => {
    expect(
      unitCodesFromReleaseError(
        badRequest(
          "Every cabinet needs a technician and a planned end date: TĐ:1-1, MSB,A-2.",
        ),
      ),
    ).toEqual(["TĐ:1-1", "MSB,A-2"]);
  });

  it("names no cabinet for another 400", () => {
    expect(
      unitCodesFromReleaseError(badRequest("Reason: must not be empty.")),
    ).toEqual([]);
  });
});
