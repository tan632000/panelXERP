import { describe, expect, it } from "vitest";

import {
  isDemandBearingOrder,
  isIssuableOrder,
  isReturnableOrder,
} from "@plugins/inventory/_shared/order-status-gates";

describe("order status gates", () => {
  it("treats an order in production like an open one", () => {
    for (const gate of [
      isIssuableOrder,
      isReturnableOrder,
      isDemandBearingOrder,
    ]) {
      expect(gate("open")).toBe(true);
      expect(gate("in_production")).toBe(true);
    }
  });

  it("refuses a delivered order everywhere and a cancelled one except for returns", () => {
    expect(isIssuableOrder("delivered")).toBe(false);
    expect(isReturnableOrder("delivered")).toBe(false);
    expect(isDemandBearingOrder("delivered")).toBe(false);
    expect(isIssuableOrder("cancelled")).toBe(false);
    expect(isDemandBearingOrder("cancelled")).toBe(false);
    expect(isReturnableOrder("cancelled")).toBe(true);
  });
});
