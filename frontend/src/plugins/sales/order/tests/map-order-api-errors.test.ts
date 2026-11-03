import { describe, expect, it } from "vitest";

import { axiosErrorWithMessage } from "@/test/helpers/axios-error";

import { resolveOrderToastKey } from "@plugins/sales/order/utils/map-order-api-errors";

describe("resolveOrderToastKey", () => {
  it("names the production order that stops a cancellation", () => {
    // The server's wording also holds the general "and cannot be" of an order state.
    const error = axiosErrorWithMessage(
      "Order 3274 has production order LSX_2026_0003 and cannot be cancelled: cancel the production order first.",
    );
    expect(resolveOrderToastKey(error)).toBe("hasProductionOrder");
  });

  it("keeps the general state message for any other refused move", () => {
    const error = axiosErrorWithMessage(
      "Order 3274 is cancelled and cannot be changed.",
    );
    expect(resolveOrderToastKey(error)).toBe("orderState");
  });
});
