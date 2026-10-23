import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExcelJobsPanel } from "@/kernel/core/components/ui/ExcelJobsPanel";
import { excelJobsStore } from "@/kernel/core/lib/excel-jobs-store";
import viCommon from "@/kernel/langs/vi/common.json";

import type { ExcelJobStreamHandlers } from "@/kernel/core/lib/excel-job-stream";

const apiGet = vi.hoisted(() => vi.fn());
const follow = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), defaults: {} },
}));
vi.mock("@/kernel/core/lib/excel-job-stream", () => ({
  followExcelJob: follow,
}));
vi.mock("@/kernel/core/lib/download-blob", () => ({ downloadBlob }));

let handlers: ExcelJobStreamHandlers | undefined;

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <ExcelJobsPanel />
    </NextIntlClientProvider>,
  );
}

const inThirtyMinutes = () =>
  new Date(Date.now() + 30 * 60 * 1000).toISOString();

beforeEach(() => {
  handlers = undefined;
  apiGet.mockReset();
  downloadBlob.mockReset();
  follow
    .mockReset()
    .mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      handlers = h;
      return () => undefined;
    });
  excelJobsStore.reset();
});

afterEach(() => {
  cleanup();
  excelJobsStore.reset();
});

describe("ExcelJobsPanel", () => {
  it("renders nothing while no job exists", () => {
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("follows a job's stage and progress (R7.7)", () => {
    renderPanel();

    act(() => excelJobsStore.addJob("job-1", "Doanh thu dịch vụ", "export"));
    expect(screen.getByText("Doanh thu dịch vụ")).toBeInTheDocument();
    expect(screen.getByText(/Đang chờ xử lý/)).toBeInTheDocument();

    act(() => handlers?.onProgress({ stage: "writing", percent: 40 }));
    expect(screen.getByText(/Đang ghi tệp Excel · 40%/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { hidden: true })).toBeDefined();
  });

  it("keeps listing jobs when the shell unmounts and mounts again (R7.7)", () => {
    const first = renderPanel();
    act(() => excelJobsStore.addJob("job-1", "Doanh thu dịch vụ", "export"));
    act(() => handlers?.onProgress({ stage: "uploading", percent: 95 }));
    first.unmount();

    renderPanel();

    expect(screen.getByText(/Đang tải tệp lên · 95%/)).toBeInTheDocument();
  });

  it("offers the download once and then reads downloaded (R8.2, R8.5)", async () => {
    apiGet.mockResolvedValue({ data: new Blob(["zip"]) });
    renderPanel();
    act(() => excelJobsStore.addJob("job-1", "Doanh thu dịch vụ", "export"));
    act(() =>
      handlers?.onCompleted({
        fileName: "DichVu_Export_2026-09-24",
        sizeBytes: 10,
        expiresAt: inThirtyMinutes(),
        downloaded: false,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Tải xuống/ }));

    await waitFor(() =>
      expect(screen.getByText(viCommon.excel.downloaded)).toBeInTheDocument(),
    );
    expect(apiGet).toHaveBeenCalledWith("/excel/jobs/job-1/download", {
      responseType: "blob",
    });
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "DichVu_Export_2026-09-24.zip",
    );
    expect(screen.queryByRole("button", { name: /Tải xuống/ })).toBeNull();
  });

  it("shows an expired file without a button after a 410 (R8.5)", async () => {
    apiGet.mockRejectedValue({ response: { status: 410 } });
    renderPanel();
    act(() => excelJobsStore.addJob("job-1", "Doanh thu dịch vụ", "export"));
    act(() =>
      handlers?.onCompleted({
        fileName: "DichVu",
        sizeBytes: 10,
        expiresAt: inThirtyMinutes(),
        downloaded: false,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Tải xuống/ }));

    await waitFor(() =>
      expect(screen.getByText(viCommon.excel.expired)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /Tải xuống/ })).toBeNull();
  });

  it("offers no download once expiresAt has passed (R8.2)", () => {
    renderPanel();
    act(() => excelJobsStore.addJob("job-1", "Doanh thu dịch vụ", "export"));
    act(() =>
      handlers?.onCompleted({
        fileName: "DichVu",
        sizeBytes: 10,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        downloaded: false,
      }),
    );

    expect(screen.getByText(viCommon.excel.expired)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tải xuống/ })).toBeNull();
  });

  it("shows a failed job's translated reason", () => {
    renderPanel();
    act(() => excelJobsStore.addJob("job-1", "Doanh thu dịch vụ", "export"));
    act(() => handlers?.onFailed({ code: "exportTooLarge" }));

    expect(
      screen.getByText(viCommon.excel.error.exportTooLarge),
    ).toBeInTheDocument();
  });

  it("shows a lost connection", () => {
    renderPanel();
    act(() => excelJobsStore.addJob("job-1", "Doanh thu dịch vụ", "export"));
    act(() => handlers?.onConnectionLost());

    expect(screen.getByText(viCommon.excel.connectionLost)).toBeInTheDocument();
  });
});
