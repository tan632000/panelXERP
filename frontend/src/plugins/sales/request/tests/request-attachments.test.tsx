import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viRequest from "@/kernel/langs/vi/request.json";

import { RequestAttachments } from "@plugins/sales/request/components/RequestAttachments";
import { RequestPermission } from "@plugins/sales/request/permissions/request-permission.keys";
import {
  attachmentFileProblem,
  fileExtension,
} from "@plugins/sales/request/utils/attachment-file";

import type { RequestStatus } from "@plugins/sales/request/constants";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiDelete = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: {
    get: apiGet,
    post: apiPost,
    patch: vi.fn(),
    delete: apiDelete,
  },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ can, permissions: [...granted.value] }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

const ATTACHMENT = {
  id: 2,
  requestId: 5,
  fileName: "plan.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  uploadedBy: 11,
  createdAt: "2026-10-02T00:00:00.000Z",
};

function renderSection(status: RequestStatus = "draft") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, request: viRequest }}
      >
        <NotificationProvider>
          <RequestAttachments requestId={5} status={status} />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

function pick(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not rendered");
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  grant(RequestPermission.read, RequestPermission.update);
  apiGet.mockResolvedValue({ data: [ATTACHMENT] });
});

afterEach(cleanup);

describe("attachment file check", () => {
  it("reads the extension case-insensitively and refuses names without one", () => {
    expect(fileExtension("Plan.PDF")).toBe("pdf");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
    expect(fileExtension("noextension")).toBeNull();
    expect(fileExtension(".pdf")).toBeNull();
    expect(fileExtension("trailing.")).toBeNull();
  });

  it.each(["a.pdf", "a.DWG", "a.dxf", "a.xlsx", "a.png", "a.jpg", "a.jpeg"])(
    "accepts %s",
    (name) => {
      expect(attachmentFileProblem(new File(["x"], name))).toBeNull();
    },
  );

  it.each(["a.html", "a.exe", "a.svg", "a.zip", "a.pdf.html", "a"])(
    "refuses %s by type",
    (name) => {
      expect(attachmentFileProblem(new File(["x"], name))).toBe("type");
    },
  );

  it("refuses an empty file and one over 20 MB", () => {
    expect(attachmentFileProblem(new File([], "a.pdf"))).toBe("empty");
    const big = new File(["x"], "a.pdf");
    Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 + 1 });
    expect(attachmentFileProblem(big)).toBe("size");
  });
});

describe("RequestAttachments", () => {
  it("lists the files with their size, to anyone who can read the request", async () => {
    grant(RequestPermission.read);
    renderSection();

    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
    expect(
      screen.getByTitle(viRequest.attachments.download),
    ).toBeInTheDocument();
    // No upload control and no delete without request:update.
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
  });

  it("refuses a disallowed extension on the client without calling the API", async () => {
    renderSection();
    await screen.findByText("plan.pdf");

    pick(new File(["<html></html>"], "evil.html", { type: "text/html" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      viRequest.attachments.problems.type,
    );
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("uploads an allowed file as multipart to the request's attachments", async () => {
    apiPost.mockResolvedValue({ data: ATTACHMENT });
    renderSection();
    await screen.findByText("plan.pdf");

    const file = new File(["%PDF-1.7"], "drawing.pdf", {
      type: "application/pdf",
    });
    pick(file);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = apiPost.mock.calls[0] as [string, FormData];
    expect(url).toBe("/sales/requests/5/attachments");
    expect(body.get("file")).toBe(file);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for confirmation before deleting a file", async () => {
    apiDelete.mockResolvedValue({ data: null });
    renderSection();
    await screen.findByText("plan.pdf");

    fireEvent.click(screen.getByTitle(viCommon.delete));
    expect(apiDelete).not.toHaveBeenCalled();
    expect(
      await screen.findByText(viRequest.attachments.confirmDeleteTitle),
    ).toBeInTheDocument();

    // The row's own delete control stays behind the dialog; the dialog's is the last one.
    const deleteButtons = screen.getAllByRole("button", {
      name: viCommon.delete,
    });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => expect(apiDelete).toHaveBeenCalledTimes(1));
    expect(apiDelete).toHaveBeenCalledWith("/sales/requests/5/attachments/2");
  });

  it("allows no change once the request is estimated", async () => {
    renderSection("estimated");

    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
  });
});
