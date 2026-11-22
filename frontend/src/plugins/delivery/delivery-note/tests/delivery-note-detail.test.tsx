import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viDelivery from "@/kernel/langs/vi/delivery.json";

import { DeliveryNoteDetailPage } from "@plugins/delivery/delivery-note/components/DeliveryNoteDetailPage";

import { noteDetail, renderWithProviders } from "./delivery-note-fixtures";

import type { DeliveryNoteDetail } from "@plugins/delivery/delivery-note/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) => granted.value.has(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [...granted.value],
      user: { id: 9, role: "storekeeper" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/delivery/notes/5",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/kernel/core/lib/download-blob", () => ({ downloadBlob: download }));

// The calendar popup is not what these cases are about: a plain input stands in for it.
vi.mock("@/kernel/core/components/ui/DateInput", () => ({
  DateInput: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      aria-label="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const ALL = [
  "delivery_note:read",
  "delivery_note:ship",
  "delivery_note:receive",
  "delivery_note:cancel",
];
const A = viDelivery.note.actions;

const open = (note: DeliveryNoteDetail, ...permissions: string[]) => {
  granted.value = new Set(permissions);
  apiGet.mockResolvedValue({ data: note });
  renderWithProviders(<DeliveryNoteDetailPage />);
  return screen.findByText("MSB-01-1");
};
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("DeliveryNoteDetailPage actions", () => {
  it("ships only a draft, only with delivery_note:ship", async () => {
    await open(noteDetail({ status: "draft" }), ...ALL);
    expect(button(A.ship)).not.toBeNull();
    expect(button(A.receive)).toBeNull();
    cleanup();

    await open(noteDetail({ status: "draft" }), "delivery_note:read");
    expect(button(A.ship)).toBeNull();
    cleanup();

    await open(noteDetail({ status: "shipped" }), ...ALL);
    expect(button(A.ship)).toBeNull();
  });

  it("posts the ship step for a draft", async () => {
    apiPost.mockResolvedValue({ data: noteDetail({ status: "shipped" }) });
    await open(noteDetail({ status: "draft" }), ...ALL);

    fireEvent.click(button(A.ship) as HTMLElement);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/notes/5/ship", {});
  });

  it("offers the customer receipt only on a shipped note, only with delivery_note:receive", async () => {
    await open(noteDetail({ status: "shipped" }), ...ALL);
    expect(button(A.receive)).not.toBeNull();
    cleanup();

    await open(noteDetail({ status: "shipped" }), "delivery_note:read");
    expect(button(A.receive)).toBeNull();
    cleanup();

    for (const status of ["draft", "received", "cancelled"] as const) {
      await open(noteDetail({ status }), ...ALL);
      expect(button(A.receive), status).toBeNull();
      cleanup();
    }
  });

  it("offers cancelling on a draft or shipped note, never on a received or cancelled one", async () => {
    for (const status of ["draft", "shipped"] as const) {
      await open(noteDetail({ status }), ...ALL);
      expect(button(A.cancel), status).not.toBeNull();
      cleanup();
    }
    for (const status of ["received", "cancelled"] as const) {
      await open(noteDetail({ status }), ...ALL);
      expect(button(A.cancel), status).toBeNull();
      cleanup();
    }
    await open(noteDetail({ status: "draft" }), "delivery_note:read");
    expect(button(A.cancel)).toBeNull();
  });

  it("cancels with the trimmed reason", async () => {
    apiPost.mockResolvedValue({ data: noteDetail({ status: "cancelled" }) });
    await open(noteDetail({ status: "draft" }), ...ALL);

    fireEvent.click(button(A.cancel) as HTMLElement);
    fireEvent.change(
      await screen.findByPlaceholderText(viDelivery.note.cancel.placeholder),
      { target: { value: "  Khách hoãn  " } },
    );
    const buttons = screen.getAllByRole("button", { name: A.cancel });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/notes/5/cancel", {
      reason: "Khách hoãn",
    });
  });

  it("lists the cabinets without any way to edit a draft's cabinets", async () => {
    await open(noteDetail({ status: "draft" }), ...ALL);

    expect(screen.getByText("MSB-01-2")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("DeliveryNoteDetailPage receipt dialog", () => {
  const R = viDelivery.note.receive;
  const pdf = (name = "bien-ban.pdf") =>
    new File(["%PDF"], name, { type: "application/pdf" });

  async function openDialog() {
    await open(noteDetail({ status: "shipped" }), ...ALL);
    fireEvent.click(button(A.receive) as HTMLElement);
    await screen.findByRole("textbox", { name: new RegExp(R.receiverName) });
    return screen.getByRole("button", { name: R.submit }) as HTMLButtonElement;
  }
  const fill = (name: string, date: string, files: File[]) => {
    fireEvent.change(
      screen.getByRole("textbox", { name: new RegExp(R.receiverName) }),
      { target: { value: name } },
    );
    fireEvent.change(screen.getByLabelText("date"), { target: { value: date } });
    fireEvent.change(screen.getByLabelText(new RegExp(R.files)), {
      target: { files },
    });
  };

  it("needs a receiver, a date and a file before it can be submitted", async () => {
    const submit = await openDialog();
    expect(submit.disabled).toBe(true);

    fill("", "2026-12-02", [pdf()]);
    expect(submit.disabled).toBe(true);
    fill("Anh Nam", "", [pdf()]);
    expect(submit.disabled).toBe(true);
    fill("Anh Nam", "2026-12-02", []);
    expect(submit.disabled).toBe(true);
    fill("Anh Nam", "2026-12-02", [pdf()]);
    expect(submit.disabled).toBe(false);
  });

  it("refuses more than five files", async () => {
    const submit = await openDialog();

    fill(
      "Anh Nam",
      "2026-12-02",
      Array.from({ length: 6 }, (_, index) => pdf(`bb-${index}.pdf`)),
    );

    expect(submit.disabled).toBe(true);
    expect(screen.getByText(R.problems.count)).toBeTruthy();
  });

  it("refuses a file that is not a PDF or an image", async () => {
    const submit = await openDialog();

    fill("Anh Nam", "2026-12-02", [
      new File(["x"], "macro.exe", { type: "application/octet-stream" }),
    ]);

    expect(submit.disabled).toBe(true);
    expect(screen.getByText(R.problems.type)).toBeTruthy();
  });

  it("posts the receiver, the date and every file as multipart", async () => {
    apiPost.mockResolvedValue({ data: noteDetail({ status: "received" }) });
    const submit = await openDialog();
    fill("  Anh Nam ", "2026-12-02", [pdf("a.pdf"), pdf("b.pdf")]);

    fireEvent.click(submit);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = apiPost.mock.calls[0] as [string, FormData];
    expect(url).toBe("/delivery/notes/5/receive");
    expect(body.get("receiverName")).toBe("Anh Nam");
    expect(body.get("receivedDate")).toBe("2026-12-02");
    expect(body.getAll("files").map((file) => (file as File).name)).toEqual([
      "a.pdf",
      "b.pdf",
    ]);
  });
});

describe("DeliveryNoteDetailPage handover files", () => {
  it("downloads a file through the content route", async () => {
    const blob = new Blob(["%PDF"]);
    apiGet.mockImplementation((url: string) =>
      url.endsWith("/content")
        ? Promise.resolve({ data: blob })
        : Promise.resolve({
            data: noteDetail({
              status: "received",
              receiverName: "Anh Nam",
              receivedDate: "2026-12-02",
              files: [
                {
                  id: 3,
                  fileName: "bien-ban.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 4,
                  createdAt: "2026-12-02T03:00:00.000Z",
                },
              ],
            }),
          }),
    );
    granted.value = new Set(ALL);
    renderWithProviders(<DeliveryNoteDetailPage />);

    const list = (await screen.findByText("bien-ban.pdf")).closest("li");
    fireEvent.click(within(list as HTMLElement).getByRole("button"));

    await waitFor(() => expect(download).toHaveBeenCalledWith(blob, "bien-ban.pdf"));
    expect(apiGet).toHaveBeenCalledWith("/delivery/notes/5/files/3/content", {
      responseType: "blob",
    });
  });
});
