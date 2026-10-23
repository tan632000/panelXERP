import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkApproveAction } from "@/kernel/core/components/ui/BulkApproveAction";
import { MAX_BULK_DELETE_IDS } from "@/kernel/core/constants/list-ui";
import viCommon from "@/kernel/langs/vi/common.json";

import type { BulkApproveResult } from "@/kernel/core/types/bulk-approve";

afterEach(cleanup);

function renderAction(
  overrides: Partial<Parameters<typeof BulkApproveAction>[0]> = {},
) {
  const onConfirm = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <BulkApproveAction count={3} onConfirm={onConfirm} {...overrides} />
    </NextIntlClientProvider>,
  );
  return { ...view, onConfirm };
}

describe("bulk approve action", () => {
  it("stays out of the toolbar while nothing is ticked", () => {
    renderAction({ count: 0 });

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks before approving, naming the count", () => {
    const { onConfirm } = renderAction({ count: 3 });

    expect(screen.getByRole("button").textContent).toContain("(3)");
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "Phê duyệt 3 dòng đã chọn?",
    );
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(viCommon.bulkApprove.confirm));
    expect(onConfirm).toHaveBeenCalledWith(expect.any(Function));
  });

  it("reports why a batch left rows unapproved", () => {
    const outcome: BulkApproveResult = {
      approved: [1],
      failed: [{ id: 7, message: "Not your approval step." }],
    };
    renderAction({
      labelOf: (id) => (id === 7 ? "PR-0007" : undefined),
      onConfirm: (settle) => settle(outcome),
    });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.bulkApprove.confirm));

    const report = screen.getByRole("alertdialog");
    expect(report.textContent).toContain("1 dòng không phê duyệt được");
    expect(report.textContent).toContain("PR-0007");
    expect(report.textContent).toContain(viCommon.bulkApprove.reasonUnknown);
  });

  it("explains an unmapped refusal by its status", () => {
    renderAction({
      onConfirm: (settle) =>
        settle({
          approved: [],
          failed: [
            { id: 1, message: "Not your step.", status: 403 },
            { id: 2, message: "Record 2 not found", status: 404 },
            { id: 3, message: "Already approved.", status: 409 },
          ],
        }),
    });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.bulkApprove.confirm));

    const report = screen.getByRole("alertdialog").textContent;
    expect(report).toContain(viCommon.bulkApprove.reasonForbidden);
    expect(report).toContain(viCommon.bulkApprove.reasonNotFound);
    expect(report).toContain(viCommon.bulkApprove.reasonNotPending);
  });

  it("prefers the plugin's own reason over the status", () => {
    renderAction({
      resolveFailureReason: (message) =>
        message === "Own entry." ? "Không tự duyệt phiếu của mình." : undefined,
      onConfirm: (settle) =>
        settle({
          approved: [],
          failed: [{ id: 1, message: "Own entry.", status: 403 }],
        }),
    });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.bulkApprove.confirm));

    const report = screen.getByRole("alertdialog").textContent;
    expect(report).toContain("Không tự duyệt phiếu của mình.");
    expect(report).not.toContain(viCommon.bulkApprove.reasonForbidden);
  });

  it("reports nothing when every row was approved", () => {
    renderAction({
      onConfirm: (settle) => settle({ approved: [1, 2, 3], failed: [] }),
    });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.bulkApprove.confirm));

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("refuses a selection larger than one request may carry", () => {
    const { onConfirm } = renderAction({ count: MAX_BULK_DELETE_IDS + 1 });

    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
