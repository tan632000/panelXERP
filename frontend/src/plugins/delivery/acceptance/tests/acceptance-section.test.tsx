import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viDelivery from "@/kernel/langs/vi/delivery.json";

import { OrderDeliveryPage } from "@plugins/delivery/delivery-note/components/OrderDeliveryPage";
import {
  orderDetail,
  renderWithProviders,
} from "@plugins/delivery/delivery-note/tests/delivery-note-fixtures";
import {
  installationDetail,
  installationSummary,
} from "@plugins/delivery/installation/tests/installation-fixtures";

import type { AcceptanceView } from "@plugins/delivery/acceptance/types";
import type { InstallationDetail } from "@plugins/delivery/installation/types";

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
      user: { id: 9, role: "sales" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ orderId: "4" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/delivery/orders/4",
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

const A = viDelivery.acceptance;
const SALES = [
  "delivery_note:read",
  "installation:read",
  "acceptance:read",
  "acceptance:create",
];

const MINUTES: AcceptanceView = {
  id: 3,
  orderId: 4,
  representativeName: "Chị Lan",
  signedDate: "2026-12-20",
  createdAt: "2026-12-20T03:00:00.000Z",
  files: [
    {
      id: 31,
      fileName: "nghiem-thu.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      createdAt: "2026-12-20T03:00:00.000Z",
    },
  ],
};

/** The server's answers for one order; `state.status` and `state.minutes` move when the minutes are posted. */
function serve(
  state: { status: string; minutes: AcceptanceView | null },
  installation: InstallationDetail | null,
) {
  apiGet.mockImplementation((url: string) => {
    if (url === "/delivery/orders/4") {
      return Promise.resolve({ data: orderDetail({ status: state.status }) });
    }
    if (url === "/delivery/orders/4/acceptance") {
      return Promise.resolve({ data: state.minutes });
    }
    if (url === "/delivery/installations") {
      return Promise.resolve({
        data: {
          data: installation ? [installationSummary(installation)] : [],
          meta: { total: installation ? 1 : 0 },
        },
      });
    }
    if (installation && url === `/delivery/installations/${installation.id}`) {
      return Promise.resolve({ data: installation });
    }
    if (url.endsWith("/content")) {
      return Promise.resolve({ data: new Blob(["bytes"]) });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

async function open(
  state: { status: string; minutes: AcceptanceView | null },
  installation: InstallationDetail | null,
  permissions: string[] = SALES,
) {
  granted.value = new Set(permissions);
  serve(state, installation);
  renderWithProviders(<OrderDeliveryPage />);
  await screen.findByText(A.title);
  // Both sections settle once their reads are in: the upload button or a hint, or the minutes.
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
}
const upload = () => screen.queryByRole("button", { name: A.upload.open });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("AcceptanceSection upload button", () => {
  it("is hidden while the order is in production, with a hint naming why", async () => {
    await open({ status: "in_production", minutes: null }, null);

    expect(upload()).toBeNull();
    expect(screen.getByText(A.hints.notDelivered)).toBeTruthy();
  });

  it("is hidden on a delivered order whose installation is in progress, with a hint", async () => {
    await open(
      { status: "delivered", minutes: null },
      installationDetail({ status: "in_progress" }),
    );

    expect(upload()).toBeNull();
    expect(screen.getByText(A.hints.installationNotDone)).toBeTruthy();
  });

  it("is shown on a delivered order without an installation, and after one is done", async () => {
    await open({ status: "delivered", minutes: null }, null);
    expect(upload()).not.toBeNull();
    cleanup();

    await open(
      { status: "delivered", minutes: null },
      installationDetail({ status: "done" }),
    );
    expect(upload()).not.toBeNull();
  });

  it("is hidden without acceptance:create", async () => {
    await open({ status: "delivered", minutes: null }, null, [
      "delivery_note:read",
      "acceptance:read",
    ]);

    expect(upload()).toBeNull();
    expect(screen.getByText(A.none)).toBeTruthy();
  });
});

describe("AcceptanceSection upload dialog", () => {
  const D = A.upload;
  const file = (name: string) =>
    new File(["x"], name, { type: "application/pdf" });

  async function openDialog() {
    await open({ status: "delivered", minutes: null }, null);
    fireEvent.click(upload() as HTMLElement);
    await screen.findByRole("textbox", {
      name: new RegExp(D.representativeName),
    });
    return screen.getByRole("button", { name: D.submit }) as HTMLButtonElement;
  }
  const fill = (name: string, date: string, files: File[]) => {
    fireEvent.change(
      screen.getByRole("textbox", { name: new RegExp(D.representativeName) }),
      { target: { value: name } },
    );
    fireEvent.change(screen.getByLabelText("date"), { target: { value: date } });
    fireEvent.change(screen.getByLabelText(new RegExp(D.files)), {
      target: { files },
    });
  };

  it("needs a representative, a date and a file before it can be submitted", async () => {
    const submit = await openDialog();
    expect(submit).toBeDisabled();

    fill("", "2026-12-20", [file("a.pdf")]);
    expect(submit).toBeDisabled();
    fill("Chị Lan", "", [file("a.pdf")]);
    expect(submit).toBeDisabled();
    fill("Chị Lan", "2026-12-20", []);
    expect(submit).toBeDisabled();
    fill("Chị Lan", "2026-12-20", [file("a.pdf")]);
    expect(submit).toBeEnabled();
  });

  it("refuses more than 10 files and a file of another type", async () => {
    const submit = await openDialog();

    fill(
      "Chị Lan",
      "2026-12-20",
      Array.from({ length: 11 }, (_, index) => file(`${index}.pdf`)),
    );
    expect(submit).toBeDisabled();
    expect(screen.getByText(D.problems.count)).toBeTruthy();

    fill("Chị Lan", "2026-12-20", [file("a.docx")]);
    expect(submit).toBeDisabled();
    expect(screen.getByText(D.problems.type)).toBeTruthy();

    fill(
      "Chị Lan",
      "2026-12-20",
      Array.from({ length: 10 }, (_, index) => file(`${index}.pdf`)),
    );
    expect(submit).toBeEnabled();
  });

  it("posts the minutes and then reads the order as completed", async () => {
    const state = { status: "delivered", minutes: null as AcceptanceView | null };
    apiPost.mockImplementation(() => {
      state.status = "completed";
      state.minutes = MINUTES;
      return Promise.resolve({ data: MINUTES });
    });
    granted.value = new Set(SALES);
    serve(state, null);
    renderWithProviders(<OrderDeliveryPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: D.open }),
    );
    await screen.findByRole("textbox", {
      name: new RegExp(D.representativeName),
    });

    fill("  Chị Lan  ", "2026-12-20", [file("nghiem-thu.pdf")]);
    fireEvent.click(screen.getByRole("button", { name: D.submit }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = apiPost.mock.calls[0] as [string, FormData];
    expect(url).toBe("/delivery/orders/4/acceptance");
    expect(body.get("representativeName")).toBe("Chị Lan");
    expect(body.get("signedDate")).toBe("2026-12-20");
    expect(body.getAll("files")).toHaveLength(1);

    expect(await screen.findByText("Hoàn thành")).toBeTruthy();
    expect(await screen.findByText("Chị Lan")).toBeTruthy();
    expect(upload()).toBeNull();
  });
});

describe("AcceptanceSection read-only view", () => {
  it("shows the representative, the signed date and downloadable files to a storekeeper", async () => {
    await open({ status: "completed", minutes: MINUTES }, null, [
      "delivery_note:read",
      "installation:read",
      "acceptance:read",
    ]);

    expect(screen.getByText("Chị Lan")).toBeTruthy();
    expect(screen.getByText("20/12/2026")).toBeTruthy();
    expect(upload()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "nghiem-thu.pdf" }));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(apiGet).toHaveBeenCalledWith(
      "/delivery/acceptance-files/31/content",
      { responseType: "blob" },
    );
    expect(download.mock.calls[0][1]).toBe("nghiem-thu.pdf");
  });
});
