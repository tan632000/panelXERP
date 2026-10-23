import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkDeleteAction } from "@/kernel/core/components/ui/BulkDeleteAction";
import { MAX_BULK_DELETE_IDS } from "@/kernel/core/constants/list-ui";
import viCommon from "@/kernel/langs/vi/common.json";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";

afterEach(cleanup);

function renderAction(
  overrides: Partial<Parameters<typeof BulkDeleteAction>[0]> = {},
) {
  const onConfirm = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <BulkDeleteAction count={3} onConfirm={onConfirm} {...overrides} />
    </NextIntlClientProvider>,
  );
  return { ...view, onConfirm };
}

describe("bulk delete action", () => {
  it("stays out of the toolbar while nothing is ticked", () => {
    renderAction({ count: 0 });

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("names how many rows are ticked", () => {
    renderAction({ count: 3 });

    expect(screen.getByRole("button").textContent).toContain("(3)");
  });

  it("asks before deleting, naming the same count", () => {
    renderAction({ count: 3 });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "Xoá 3 dòng đã chọn?",
    );
  });

  it("deletes only once the confirmation is accepted", () => {
    const { onConfirm } = renderAction();

    fireEvent.click(screen.getByRole("button"));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(viCommon.delete));
    expect(onConfirm).toHaveBeenCalledWith(expect.any(Function));
  });

  it("closes without deleting when the confirmation is dismissed", () => {
    const { onConfirm } = renderAction();

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.cancel));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes the confirmation the batch emptied", () => {
    const { rerender, onConfirm } = renderAction();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    rerender(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <BulkDeleteAction count={0} onConfirm={onConfirm} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // The dialog must not come back by itself once rows are ticked again.
    rerender(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <BulkDeleteAction count={2} onConfirm={onConfirm} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("blocks a second delete while the batch is in flight", () => {
    renderAction({ pending: true });

    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });

  it("reports why a batch kept the rows it kept", () => {
    const outcome: BulkDeleteResult = {
      deleted: [1],
      failed: [
        { id: 7, message: "Cannot delete material because it is in use." },
        { id: 9, message: "wording no rule knows" },
      ],
    };
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <BulkDeleteAction
          count={3}
          labelOf={(id) => (id === 7 ? "VT_0007" : undefined)}
          resolveFailureReason={(message) =>
            message.includes("in use")
              ? "Đang được sản phẩm sử dụng"
              : viCommon.bulkDelete.reasonUnknown
          }
          onConfirm={(settle) => settle(outcome)}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.delete));

    const report = screen.getByRole("alertdialog");
    expect(report.textContent).toContain("2 dòng không xoá được");
    // The rows that went are a toast; the report speaks only about the rows that stayed.
    expect(report.textContent).not.toContain("Đã xoá");
    // A row is named the way the list names it, and falls back to its id when unknown.
    expect(report.textContent).toContain("VT_0007");
    expect(report.textContent).toContain("Đang được sản phẩm sử dụng");
    expect(report.textContent).toContain("#9");
    expect(report.textContent).toContain(viCommon.bulkDelete.reasonUnknown);
  });

  it("reports nothing when the batch deleted every row", () => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <BulkDeleteAction
          count={2}
          onConfirm={(settle) => settle({ deleted: [1, 2], failed: [] })}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.delete));

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("reports nothing when the request itself failed", () => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <BulkDeleteAction count={2} onConfirm={(settle) => settle(undefined)} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(viCommon.delete));

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("refuses a selection larger than one request may carry", () => {
    const { onConfirm } = renderAction({ count: MAX_BULK_DELETE_IDS + 1 });

    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
