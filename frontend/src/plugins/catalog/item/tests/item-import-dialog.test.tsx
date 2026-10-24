import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viItem from "@/kernel/langs/vi/item.json";
import viModal from "@/kernel/langs/vi/modal.json";

import { ItemImportDialog } from "@plugins/catalog/item/components/ItemImportDialog";

const apiPost = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

function renderDialog(onClose = vi.fn()) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, item: viItem, modal: viModal }}
      >
        <ItemImportDialog isOpen onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

function chooseFile(name = "bao-gia.xlsx") {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not rendered");
  const file = new File(["PK"], name);
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("ItemImportDialog", () => {
  it("keeps the import button disabled until a file is chosen", () => {
    renderDialog();

    expect(
      screen.getByRole("button", { name: viItem.import.submit }),
    ).toBeDisabled();
  });

  it("uploads the file as multipart and shows the created count and every rejected row", async () => {
    apiPost.mockResolvedValue({
      data: {
        created: 3,
        errors: [
          { row: 4, field: "code", reason: "missing code" },
          {
            row: 6,
            field: "code",
            reason: "code repeated with different data (first used on row 5)",
          },
          { row: 9, field: "referencePrice", reason: "something unexpected" },
        ],
      },
    });
    renderDialog();

    const file = chooseFile();
    fireEvent.click(screen.getByRole("button", { name: viItem.import.submit }));

    const result = await screen.findByTestId("import-result");
    expect(apiPost).toHaveBeenCalledTimes(1);
    const [url, body] = apiPost.mock.calls[0] as [string, FormData];
    expect(url).toBe("/items/import");
    expect(body.get("file")).toBe(file);

    expect(within(result).getByText("Đã tạo 3 vật tư.")).toBeInTheDocument();
    const rows = within(result).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("4")).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(viItem.import.reasons.missingCode),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText("6")).toBeInTheDocument();
    expect(
      within(rows[1]).getByText(viItem.import.reasons.codeRepeated),
    ).toBeInTheDocument();
    // A wording the dialog does not know is shown exactly as the server sent it.
    expect(
      within(rows[2]).getByText("something unexpected"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viItem.import.submit }),
    ).not.toBeInTheDocument();
  });

  it("reports a clean import without a rejected-rows table", async () => {
    apiPost.mockResolvedValue({ data: { created: 11, errors: [] } });
    renderDialog();

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: viItem.import.submit }));

    const result = await screen.findByTestId("import-result");
    expect(within(result).getByText("Đã tạo 11 vật tư.")).toBeInTheDocument();
    expect(within(result).queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the server's reason and no result when the whole import is refused", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "Header row not found: the sheet needs the columns." },
      },
    });
    renderDialog();

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: viItem.import.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Header row not found",
    );
    expect(screen.queryByTestId("import-result")).not.toBeInTheDocument();
  });

  it("downloads the template from the template endpoint", async () => {
    apiGet.mockResolvedValue({ data: new Blob(["x"]) });
    URL.createObjectURL = vi.fn(() => "blob:template");
    URL.revokeObjectURL = vi.fn();
    renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: viItem.import.downloadTemplate }),
    );

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    expect(apiGet.mock.calls[0][0]).toBe("/items/import-template");
    expect(apiGet.mock.calls[0][1]).toMatchObject({ responseType: "blob" });
  });
});
