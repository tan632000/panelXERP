import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import viEstimate from "@/kernel/langs/vi/estimate.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { EstimateStatusBadge } from "@plugins/sales/estimate/components/EstimateStatusBadge";

import type { RevisionStatus } from "@plugins/sales/estimate/constants";

afterEach(cleanup);

function renderBadge(status: RevisionStatus, pricedAt?: string | null) {
  return render(
    <NextIntlClientProvider
      locale="vi"
      messages={{ estimate: viEstimate, status: viStatus }}
    >
      <EstimateStatusBadge status={status} pricedAt={pricedAt} />
    </NextIntlClientProvider>,
  );
}

describe("EstimateStatusBadge", () => {
  it.each([
    ["draft", null, viEstimate.statuses.draft],
    ["submitted", null, viEstimate.pricing.awaiting],
    ["submitted", "2026-11-11T08:00:00Z", viEstimate.pricing.priced],
    ["superseded", null, viEstimate.statuses.superseded],
    // No pricing information (an older revision still submitted): the plain status.
    ["submitted", undefined, viEstimate.statuses.submitted],
  ] as const)(
    "labels %s with pricedAt %s as one badge reading %s",
    (status, pricedAt, label) => {
      const { container } = renderBadge(status, pricedAt);
      expect(screen.getByText(label)).toBeInTheDocument();
      // Exactly one badge, so no second status reads beside it.
      expect(container.childElementCount).toBe(1);
      expect(container.textContent).toBe(label);
    },
  );
});
