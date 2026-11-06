import { describe, expect, it } from "vitest";

import { resolveQuotationToastKey } from "@plugins/sales/quotation/utils/map-quotation-api-errors";

/** What the API answers: a 409 whose message carries the English wording. */
function conflict(message: string) {
  return { isAxiosError: true, response: { status: 409, data: { message } } };
}

describe("resolveQuotationToastKey", () => {
  it("maps the missing priced estimate to the no-estimate wording", () => {
    expect(
      resolveQuotationToastKey(
        conflict("The request has no priced estimate to quote."),
      ),
    ).toBe("noEstimate");
  });

  it("keeps mapping the earlier wording for a missing submitted estimate", () => {
    expect(
      resolveQuotationToastKey(
        conflict("The request has no submitted estimate to quote."),
      ),
    ).toBe("noEstimate");
  });
});
