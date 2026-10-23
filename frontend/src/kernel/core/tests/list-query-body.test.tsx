import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListQueryBody } from "@/kernel/core/components/ui/ListQueryBody";
import viCommon from "@/kernel/langs/vi/common.json";

afterEach(cleanup);

function renderBody(
  overrides: Partial<Parameters<typeof ListQueryBody>[0]> = {},
  paginationOverrides: Partial<
    Parameters<typeof ListQueryBody>[0]["pagination"]
  > = {},
) {
  const onPageChange = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <ListQueryBody
        isLoading={false}
        isEmpty={false}
        emptyState={<span>Không có dữ liệu</span>}
        pagination={{
          currentPage: 1,
          totalPages: 1,
          totalItems: 5,
          startIndex: 0,
          endIndex: 5,
          onPageChange,
          ...paginationOverrides,
        }}
        {...overrides}
      >
        <table>
          <tbody>
            <tr>
              <td>VT_0001</td>
            </tr>
          </tbody>
        </table>
      </ListQueryBody>
    </NextIntlClientProvider>,
  );
  return { ...view, onPageChange };
}

describe("list query body", () => {
  it("stays on the page being viewed while it still exists", () => {
    const { onPageChange } = renderBody(
      {},
      { currentPage: 2, totalPages: 3, totalItems: 25 },
    );

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("follows the list back when the page it was on is gone", () => {
    // Page 2 emptied by a delete: 7 rows remain, so only page 1 is left.
    const { onPageChange } = renderBody(
      { isEmpty: true },
      { currentPage: 2, totalPages: 1, totalItems: 7 },
    );

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("waits for the list before deciding a page is gone", () => {
    const { onPageChange } = renderBody(
      { isLoading: true },
      { currentPage: 3, totalPages: 1, totalItems: 0 },
    );

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("keeps the empty state on the first page of an empty list", () => {
    const { onPageChange } = renderBody(
      { isEmpty: true },
      { currentPage: 1, totalPages: 1, totalItems: 0 },
    );

    expect(screen.getByText("Không có dữ liệu")).toBeTruthy();
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
