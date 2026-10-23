import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSheetsExport } from "@/kernel/core/hooks/useSheetsExport";
import { excelJobsStore } from "@/kernel/core/lib/excel-jobs-store";
import viCommon from "@/kernel/langs/vi/common.json";

import type React from "react";

const apiPost = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const follow = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: vi.fn(), post: apiPost, put: vi.fn(), defaults: {} },
}));
vi.mock("@/kernel/core/lib/toast", () => ({
  toast: { showError: toastError, showSuccess: vi.fn() },
}));
vi.mock("@/kernel/core/lib/excel-job-stream", () => ({
  followExcelJob: follow,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      {children}
    </NextIntlClientProvider>
  );
}

const SHEETS = [
  { key: "monthly", sheet: { columns: [{ key: "month", label: "Tháng" }] } },
];

beforeEach(() => {
  vi.restoreAllMocks();
  apiPost.mockReset();
  toastError.mockReset();
  follow.mockReset().mockReturnValue(() => undefined);
  excelJobsStore.reset();
});

describe("useSheetsExport", () => {
  it("posts the sheets to the feature route and hands the job to the job panel", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-9" } });
    const addJob = vi.spyOn(excelJobsStore, "addJob");
    const { result } = renderHook(
      () => useSheetsExport({ endpoint: "/reports/sales/export" }),
      { wrapper },
    );

    await act(() =>
      result.current.exportSheets(
        { tab: "business", from: "2026-08-01", sheets: SHEETS },
        "BaoCao",
      ),
    );

    expect(apiPost).toHaveBeenCalledWith("/reports/sales/export", {
      tab: "business",
      from: "2026-08-01",
      sheets: SHEETS,
    });
    expect(addJob).toHaveBeenCalledWith("job-9", "BaoCao", "export");
  });

  it("says too many jobs are open on a 429, and nothing is queued", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429 },
    });
    const addJob = vi.spyOn(excelJobsStore, "addJob");
    const { result } = renderHook(
      () => useSheetsExport({ endpoint: "/reports/sales/export" }),
      { wrapper },
    );

    await act(() => result.current.exportSheets({ sheets: SHEETS }, "BaoCao"));

    expect(toastError).toHaveBeenCalledWith(viCommon.excel.tooManyJobs);
    expect(addJob).not.toHaveBeenCalled();
  });
});
