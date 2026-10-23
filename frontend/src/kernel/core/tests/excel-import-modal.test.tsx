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

import { ExcelImportModal } from "@/kernel/core/components/ui/ExcelImportModal";
import viCommon from "@/kernel/langs/vi/common.json";

import type { ExcelImportValidation } from "@/kernel/core/components/ui/ExcelImportModal";
import type { ExcelJobStreamHandlers } from "@/kernel/core/lib/excel-job-stream";
import type { ExcelImportRow } from "@/kernel/core/types/excel";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const follow = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, put: vi.fn(), defaults: {} },
}));
vi.mock("@/kernel/core/lib/excel-job-stream", () => ({
  followExcelJob: follow,
}));
vi.mock("@/kernel/core/lib/download-blob", () => ({ downloadBlob }));

const COLUMNS = [
  { key: "code", header: "Mã lô", required: true },
  { key: "date", header: "Ngày", required: true },
];

interface Payload {
  lots: number;
}

function renderModal(
  overrides: Partial<{
    validateRows: (
      rows: ExcelImportRow[],
    ) =>
      ExcelImportValidation<Payload> | Promise<ExcelImportValidation<Payload>>;
    onSubmit: (payload: Payload) => Promise<void>;
  }> = {},
) {
  const onClose = vi.fn();
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const validateRows =
    overrides.validateRows ??
    ((rows: ExcelImportRow[]) => ({
      errors: [],
      payload: { lots: rows.length },
    }));

  render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <ExcelImportModal<Payload>
        open
        onClose={onClose}
        title="Nhập lệnh XLBM"
        columns={COLUMNS}
        templateFileName="LenhXLBM_Import_Template.xlsx"
        validateRows={validateRows}
        onSubmit={onSubmit}
      />
    </NextIntlClientProvider>,
  );
  return { onClose, onSubmit };
}

function pickFile(name: string, contents = "x") {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([contents], name);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

function dropFile(name: string) {
  const dropzone = screen.getByRole("button", { name: /Kéo thả/ });
  const file = new File(["x"], name);
  fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  downloadBlob.mockReset();
  follow.mockReset().mockReturnValue(() => undefined);
});

afterEach(cleanup);

describe("ExcelImportModal", () => {
  it("rejects a non-xlsx file before any request", async () => {
    renderModal();

    await act(async () => pickFile("lenh.csv"));

    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.getByText(/Chỉ chấp nhận tệp \.xlsx/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nhập dữ liệu/ })).toBeDisabled();
  });

  it("rejects a dropped .csv with an inline dropzone error and no request", async () => {
    renderModal();

    await act(async () => dropFile("lenh.csv"));

    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.getByText(/Chỉ chấp nhận tệp \.xlsx/)).toBeInTheDocument();
  });

  it("starts parsing a dropped .xlsx", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-drop" } });
    follow.mockReturnValue(() => undefined);
    renderModal();

    await act(async () => dropFile("lenh.xlsx"));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
  });

  it("opens the file picker on Enter and shows the file card with name and size", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-card" } });
    apiGet.mockResolvedValue({
      data: {
        rows: [{ fileRow: 2, values: { code: "L-1", date: "2026-09-01" } }],
      },
    });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onCompleted({ rowCount: 1 });
      return () => undefined;
    });
    renderModal();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.keyDown(screen.getByRole("button", { name: /Kéo thả/ }), {
      key: "Enter",
    });
    expect(clickSpy).toHaveBeenCalled();

    await act(async () => pickFile("lenh.xlsx", "x".repeat(2048)));

    expect(screen.getByText("lenh.xlsx")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xoá tệp" }));
    expect(screen.getByRole("button", { name: /Kéo thả/ })).toBeInTheDocument();
  });

  it("shows the parse stage and percent while the job runs", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-1" } });
    let handlers: ExcelJobStreamHandlers | undefined;
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      handlers = h;
      return () => undefined;
    });
    renderModal();

    await act(async () => pickFile("lenh.xlsx"));
    await waitFor(() => expect(handlers).toBeDefined());
    act(() => handlers?.onProgress({ stage: "reading", percent: 42 }));

    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it("lists a kernel error and keeps Submit disabled", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-2" } });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onFailed({
        code: "missingColumns",
        errors: [{ fileRow: 1, code: "missingColumns", column: "date" }],
      });
      return () => undefined;
    });
    renderModal();

    await act(async () => pickFile("lenh.xlsx"));

    const item = screen.getByText(/date/);
    expect(item).toBeInTheDocument();
    expect(item.closest("section")).toHaveClass(
      "border-danger-text",
      "bg-danger-bg",
    );
    expect(item.closest("ul")).toHaveClass("text-danger-text");
    expect(screen.getByRole("button", { name: /Nhập dữ liệu/ })).toBeDisabled();
  });

  it("lists requiredMissing issues with their row and column, styled as an error", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-3" } });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onFailed({
        code: "requiredMissing",
        errors: [{ fileRow: 5, code: "requiredMissing", column: "Ngày" }],
      });
      return () => undefined;
    });
    renderModal();

    await act(async () => pickFile("lenh.xlsx"));

    const item = screen.getByText(/Dòng 5.*Ngày/);
    expect(item).toBeInTheDocument();
    expect(item.closest("li")).toHaveClass("border-danger-text/30");
  });

  it("merges a non-fatal requiredMissing issue with the feature's own row errors, in one pass", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-merge" } });
    apiGet.mockResolvedValue({
      data: {
        rows: [
          { fileRow: 2, values: { code: "", date: "2026-09-01" } },
          { fileRow: 3, values: { code: "L-2", date: "2099-01-01" } },
        ],
      },
    });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      // Non-fatal: the job completes with every row plus the issue found reading them.
      h.onCompleted({
        rowCount: 2,
        issues: [{ fileRow: 2, code: "requiredMissing", column: "Mã lô" }],
      });
      return () => undefined;
    });
    const validateRows = (rows: ExcelImportRow[]) => ({
      errors: rows
        .filter((row) => row.values.date > "2026-12-31")
        .map((row) => ({ fileRow: row.fileRow, message: "Ngày ở tương lai" })),
      payload: undefined,
    });
    renderModal({ validateRows });

    await act(async () => pickFile("lenh.xlsx"));

    expect(screen.getByText(/Dòng 2.*Mã lô/)).toBeInTheDocument();
    expect(screen.getByText(/Ngày ở tương lai/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nhập dữ liệu/ })).toBeDisabled();
  });

  it("submits the validated payload for a clean file", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-4" } });
    apiGet.mockResolvedValue({
      data: {
        rows: [{ fileRow: 2, values: { code: "L-1", date: "2026-09-01" } }],
      },
    });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onCompleted({ rowCount: 1 });
      return () => undefined;
    });
    const { onSubmit, onClose } = renderModal();

    await act(async () => pickFile("lenh.xlsx"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Nhập dữ liệu/ }),
      ).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Nhập dữ liệu/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ lots: 1 }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the modal open and shows the server error on a rejected submit", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-5" } });
    apiGet.mockResolvedValue({
      data: {
        rows: [{ fileRow: 2, values: { code: "L-1", date: "2026-09-01" } }],
      },
    });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onCompleted({ rowCount: 1 });
      return () => undefined;
    });
    const onSubmit = vi.fn().mockRejectedValue(new Error("server down"));
    const { onClose } = renderModal({ onSubmit });

    await act(async () => pickFile("lenh.xlsx"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Nhập dữ liệu/ }),
      ).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Nhập dữ liệu/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Đã xảy ra lỗi|Something went wrong/),
    ).toBeInTheDocument();
  });
  it("resets picked file and errors when the modal closes", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-reset" } });
    apiGet.mockResolvedValue({
      data: {
        rows: [{ fileRow: 2, values: { code: "L-1", date: "2026-09-01" } }],
      },
    });
    follow.mockImplementation((_id: string, h: ExcelJobStreamHandlers) => {
      h.onCompleted({ rowCount: 1 });
      return () => undefined;
    });

    const { rerender } = render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <ExcelImportModal<Payload>
          open={true}
          onClose={vi.fn()}
          title="Nhập lệnh XLBM"
          columns={COLUMNS}
          templateFileName="LenhXLBM_Import_Template.xlsx"
          validateRows={() => ({ errors: [], payload: { lots: 1 } })}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await act(async () => pickFile("lenh.xlsx"));
    expect(screen.getByText("lenh.xlsx")).toBeInTheDocument();

    // Close modal
    rerender(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <ExcelImportModal<Payload>
          open={false}
          onClose={vi.fn()}
          title="Nhập lệnh XLBM"
          columns={COLUMNS}
          templateFileName="LenhXLBM_Import_Template.xlsx"
          validateRows={() => ({ errors: [], payload: { lots: 1 } })}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    // Reopen modal
    rerender(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <ExcelImportModal<Payload>
          open={true}
          onClose={vi.fn()}
          title="Nhập lệnh XLBM"
          columns={COLUMNS}
          templateFileName="LenhXLBM_Import_Template.xlsx"
          validateRows={() => ({ errors: [], payload: { lots: 1 } })}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    // File card should be gone and dropzone should be visible again
    expect(screen.queryByText("lenh.xlsx")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kéo thả/ })).toBeInTheDocument();
  });
});
