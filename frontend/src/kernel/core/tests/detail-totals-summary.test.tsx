import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailTotalsSummary } from "@/kernel/core/components/ui/DetailTotalsSummary";

function renderSummary(discount: number, shippingFee: number) {
  render(
    <DetailTotalsSummary
      currency="VND"
      rows={[
        { key: "goods", label: "Tổng tiền hàng", amount: 42500000 },
        { key: "tax", label: "Tổng tiền thuế", amount: 0 },
        {
          key: "discount",
          label: "Tổng chiết khấu",
          amount: discount,
          effect: "subtracted",
        },
        {
          key: "shipping",
          label: "Phí vận chuyển",
          amount: shippingFee,
          effect: "added",
        },
      ]}
      total={{ label: "Tổng cộng", amount: 42500000 - discount + shippingFee }}
    />,
  );
}

describe("DetailTotalsSummary", () => {
  it("suffixes every figure with the currency", () => {
    // Non-degenerate on purpose: with no discount and no shipping the goods row and the
    // total carry the same figure, and the assertion would not say which it found.
    renderSummary(120000, 350000);

    expect(screen.getByText("42.500.000 VND")).toBeInTheDocument();
    expect(screen.getByText("42.730.000 VND")).toBeInTheDocument();
  });

  /** A "-0" would state a deduction that never happened, so a zero reads plainly. */
  it("leaves a zero unsigned and uncoloured", () => {
    renderSummary(0, 0);

    const zeros = screen.getAllByText("0 VND");
    expect(zeros.length).toBeGreaterThan(0);
    for (const zero of zeros) {
      expect(zero.className).not.toContain("text-danger-text");
    }
  });

  it("marks a real deduction with a minus and the danger colour", () => {
    renderSummary(120000, 0);

    const discount = screen.getByText("-120.000 VND");
    expect(discount).toBeInTheDocument();
    expect(discount.className).toContain("text-danger-text");
  });

  it("marks an addition with a plus, and does not colour it as a deduction", () => {
    renderSummary(0, 350000);

    const shipping = screen.getByText("+350.000 VND");
    expect(shipping).toBeInTheDocument();
    expect(shipping.className).not.toContain("text-danger-text");
  });

  it("formats every row and the total with a caller's formatter, signs still its own", () => {
    render(
      <DetailTotalsSummary
        currency="VND"
        formatAmount={(amount) => `${amount} ₫`}
        rows={[
          { key: "goods", label: "Tổng tiền hàng", amount: 500 },
          {
            key: "discount",
            label: "Tổng chiết khấu",
            amount: 20,
            effect: "subtracted",
          },
        ]}
        total={{ label: "Tổng cộng", amount: 480 }}
      />,
    );

    expect(screen.getByText("500 ₫")).toBeInTheDocument();
    expect(screen.getByText("-20 ₫")).toBeInTheDocument();
    expect(screen.getByText("480 ₫")).toBeInTheDocument();
    expect(screen.queryByText(/VND/)).not.toBeInTheDocument();
  });

  it("sets the total apart from the components it is made of", () => {
    renderSummary(120000, 350000);

    const total = screen.getByText("42.730.000 VND");
    expect(total.className).toContain("text-success-text");
    expect(total.className).toContain("font-bold");
  });
});
