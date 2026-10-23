import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Pagination,
  type PaginationProps,
} from "@/kernel/core/components/ui/Pagination";
import viCommon from "@/kernel/langs/vi/common.json";

afterEach(cleanup);

function renderPagination(props: Partial<PaginationProps>) {
  render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <Pagination
        currentPage={5}
        totalPages={5}
        totalItems={116}
        startIndex={100}
        endIndex={116}
        onPageChange={vi.fn()}
        itemLabel="phiếu"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("Pagination count caption", () => {
  it("names the page's documents, their lines and the overall total", () => {
    renderPagination({
      currentPage: 1,
      totalItems: 108,
      startIndex: 0,
      endIndex: 25,
      lineCount: 150,
    });
    expect(
      screen.getByText("Hiển thị phiếu 1–25 (150 dòng VT) · Tổng 108 phiếu"),
    ).toBeTruthy();
  });

  it("keeps the same sentence on the last page and on a single page", () => {
    renderPagination({ lineCount: 40 });
    expect(
      screen.getByText("Hiển thị phiếu 101–116 (40 dòng VT) · Tổng 116 phiếu"),
    ).toBeTruthy();
    cleanup();
    renderPagination({
      currentPage: 1,
      totalPages: 1,
      totalItems: 8,
      startIndex: 0,
      endIndex: 8,
      lineCount: 40,
    });
    expect(
      screen.getByText("Hiển thị phiếu 1–8 (40 dòng VT) · Tổng 8 phiếu"),
    ).toBeTruthy();
  });

  it("lets a list name its lines", () => {
    renderPagination({ lineCount: 3, lineLabel: "dòng SP" });
    expect(
      screen.getByText("Hiển thị phiếu 101–116 (3 dòng SP) · Tổng 116 phiếu"),
    ).toBeTruthy();
  });

  it("keeps the plain caption on a list drawn one row per document", () => {
    renderPagination({});
    expect(screen.getByText("Hiển thị 101–116 / 116 phiếu")).toBeTruthy();
  });
});
