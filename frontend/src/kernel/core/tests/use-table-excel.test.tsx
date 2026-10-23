import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTableExport } from "@/kernel/core/hooks/useTableExport";
import { useTableImport } from "@/kernel/core/hooks/useTableImport";
import { excelJobsStore } from "@/kernel/core/lib/excel-jobs-store";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumn } from "@/kernel/core/components/ui/Table";
import type { ExcelJobStreamHandlers } from "@/kernel/core/lib/excel-job-stream";
import type React from "react";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const follow = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, put: vi.fn(), defaults: {} },
}));
vi.mock("@/kernel/core/lib/toast", () => ({
  toast: { showError: toastError, showSuccess: vi.fn() },
}));
vi.mock("@/kernel/core/lib/excel-job-stream", () => ({
  followExcelJob: follow,
}));

interface Row {
  id: string;
}

const COLUMNS: Array<TableColumn<Row>> = [
  { key: "code", header: "Mã", hideable: false },
  { key: "name", header: "Tên" },
  { key: "note", header: "Ghi chú" },
  { key: "secret", header: "Nội bộ", export: false },
  { key: "actions", header: "" },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  toastError.mockReset();
  follow.mockReset().mockReturnValue(() => undefined);
  excelJobsStore.reset();
});

afterEach(() => excelJobsStore.reset());

describe("useTableExport", () => {
  function renderExport(columnPreferenceKey?: string) {
    return renderHook(
      () =>
        useTableExport<Row>({
          endpoint: "/service-revenue/export",
          columns: COLUMNS,
          columnPreferenceKey,
          rowGroupField: "orderId",
          fileName: "DichVu_Export_2026-09-24",
          label: "Dịch vụ",
        }),
      { wrapper },
    );
  }

  it("posts the query and the visible columns, then tracks the job (R1.5)", async () => {
    apiGet.mockResolvedValue({
      data: {
        moduleKey: "svc_v2",
        visibleColumns: ["note", "secret", "actions"],
        frozenColumn: null,
      },
    });
    apiPost.mockResolvedValue({ data: { jobId: "job-9" } });
    const { result } = renderExport("svc_v2");
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    await act(() => result.current.exportRows({ status: "open" }));

    const [url, body] = apiPost.mock.calls[0] as [
      string,
      {
        query: unknown;
        sheet: { columns: Array<{ key: string }> };
        fileName: string;
      },
    ];
    expect(url).toBe("/service-revenue/export");
    expect(body.query).toEqual({ status: "open" });
    expect(body.fileName).toBe("DichVu_Export_2026-09-24");
    expect(body.sheet.columns.map((column) => column.key)).toEqual([
      "code",
      "note",
    ]);
    expect(excelJobsStore.getJobs()).toEqual([
      expect.objectContaining({
        id: "job-9",
        label: "Dịch vụ",
        kind: "export",
      }),
    ]);
  });

  it("leaves out a default-hidden column for a reader who never customised the list", async () => {
    apiGet.mockResolvedValue({ data: null });
    apiPost.mockResolvedValue({ data: { jobId: "job-10" } });
    const { result } = renderHook(
      () =>
        useTableExport<Row>({
          endpoint: "/service-revenue/export",
          columns: [
            ...COLUMNS.slice(0, 2),
            { key: "detail", header: "Chi tiết", defaultHidden: true },
          ],
          columnPreferenceKey: "svc_v2",
          fileName: "DichVu",
          label: "Dịch vụ",
        }),
      { wrapper },
    );
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    await act(() => result.current.exportRows({}));

    const [, body] = apiPost.mock.calls[0] as [
      string,
      { sheet: { columns: Array<{ key: string }> } },
    ];
    expect(body.sheet.columns.map((column) => column.key)).toEqual([
      "code",
      "name",
    ]);
  });

  it("sends one request for two clicks while the first is in flight", async () => {
    let release: (value: unknown) => void = () => undefined;
    apiPost.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderExport();

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.exportRows({});
      void result.current.exportRows({});
    });
    release({ data: { jobId: "job-1" } });
    await act(() => first);

    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("toasts tooManyJobs on 429 and exportFailed otherwise", async () => {
    apiPost.mockRejectedValueOnce({ response: { status: 429 } });
    apiPost.mockRejectedValueOnce({ response: { status: 500 } });
    const { result } = renderExport();

    await act(() => result.current.exportRows({}));
    await act(() => result.current.exportRows({}));

    expect(toastError.mock.calls).toEqual([
      [viCommon.excel.tooManyJobs],
      [viCommon.excel.exportFailed],
    ]);
    expect(excelJobsStore.getJobs()).toHaveLength(0);
  });
});

describe("useTableImport", () => {
  const IMPORT_COLUMNS = [
    { key: "lotCode", header: "Mã lô" },
    { key: "date", header: "Ngày" },
  ];

  function renderImport() {
    return renderHook(() => useTableImport({ columns: IMPORT_COLUMNS }), {
      wrapper,
    });
  }

  it("rejects a non-xlsx file before any request", async () => {
    const { result } = renderImport();

    const outcome = await result.current.parseFile(
      new File(["a,b"], "lenh.csv", { type: "text/csv" }),
    );

    expect(outcome.errors).toEqual([{ fileRow: 1, code: "invalidFile" }]);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("uploads, follows the parse job with progress, and returns its rows", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-3" } });
    apiGet.mockResolvedValue({
      data: {
        rows: [{ fileRow: 2, values: { lotCode: "L-1", date: "2026-09-01" } }],
      },
    });
    let handlers: ExcelJobStreamHandlers | undefined;
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      handlers = h;
      return () => undefined;
    });
    const { result } = renderImport();

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.parseFile(new File(["x"], "lenh.xlsx"));
    });
    await waitFor(() => expect(handlers).toBeDefined());
    act(() => handlers?.onProgress({ stage: "reading", percent: 60 }));
    expect(result.current.progress).toEqual({ stage: "reading", percent: 60 });
    act(() => handlers?.onCompleted({ rowCount: 1 }));

    await expect(pending).resolves.toEqual({
      rows: [{ fileRow: 2, values: { lotCode: "L-1", date: "2026-09-01" } }],
      errors: [],
    });
    const [route, form] = apiPost.mock.calls[0] as [string, FormData];
    expect(route).toBe("/excel/parse");
    expect(JSON.parse(form.get("sheet") as string)).toEqual({
      columns: [
        { key: "lotCode", label: "Mã lô" },
        { key: "date", label: "Ngày" },
      ],
    });
    expect(apiGet).toHaveBeenCalledWith("/excel/jobs/job-3/result");
  });

  it("returns every header problem of a failed parse job", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-4" } });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onFailed({
        code: "missingColumns",
        errors: [{ fileRow: 1, code: "missingColumns", column: "date" }],
      });
      return () => undefined;
    });
    const { result } = renderImport();

    const outcome = await act(() =>
      result.current.parseFile(new File(["x"], "lenh.xlsx")),
    );

    expect(outcome.errors).toEqual([
      { fileRow: 1, code: "missingColumns", column: "date" },
    ]);
  });

  it("completes with rows and non-fatal issues together, instead of failing the whole job", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-required" } });
    apiGet.mockResolvedValue({
      data: {
        rows: [
          { fileRow: 2, values: { lotCode: "", date: "2026-09-01" } },
          { fileRow: 3, values: { lotCode: "L-2", date: "2026-09-02" } },
        ],
      },
    });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onCompleted({
        rowCount: 2,
        issues: [{ fileRow: 2, code: "requiredMissing", column: "Mã lô" }],
      });
      return () => undefined;
    });
    const { result } = renderImport();

    const outcome = await act(() =>
      result.current.parseFile(new File(["x"], "lenh.xlsx")),
    );

    expect(outcome.rows).toHaveLength(2);
    expect(outcome.errors).toEqual([
      { fileRow: 2, code: "requiredMissing", column: "Mã lô" },
    ]);
  });

  it("resolves a still-running parse instead of hanging when a new file is picked", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-5" } });
    const stops: Array<() => void> = [];
    follow.mockImplementation(() => {
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });
    const { result } = renderImport();

    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.parseFile(new File(["x"], "lenh.xlsx"));
    });
    await waitFor(() => expect(stops).toHaveLength(1));

    act(() => {
      void result.current.parseFile(new File(["y"], "lenh2.xlsx"));
    });

    await expect(first).resolves.toEqual({
      rows: [],
      errors: [{ fileRow: 1, code: "aborted" }],
    });
    expect(stops[0]).toHaveBeenCalled();
  });

  it("resolves a still-running parse on unmount instead of hanging", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-6" } });
    follow.mockImplementation(() => vi.fn());
    const { result, unmount } = renderImport();

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.parseFile(new File(["x"], "lenh.xlsx"));
    });
    await waitFor(() => expect(follow).toHaveBeenCalled());

    unmount();

    await expect(pending).resolves.toEqual({
      rows: [],
      errors: [{ fileRow: 1, code: "aborted" }],
    });
  });
});
