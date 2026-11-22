import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viDelivery from "@/kernel/langs/vi/delivery.json";

import { renderWithProviders } from "@plugins/delivery/delivery-note/tests/delivery-note-fixtures";
import { InstallationSection } from "@plugins/delivery/installation/components/InstallationSection";

import {
  installationDetail,
  installationSummary,
} from "./installation-fixtures";

import type { InstallationDetail } from "@plugins/delivery/installation/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const showError = vi.hoisted(() => vi.fn());
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

// The toast host is not mounted in a section test, so the notifier is observed directly.
vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError,
    showInfo: vi.fn(),
    showWarning: vi.fn(),
  }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

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

const I = viDelivery.installation;
const SITE = "Công trình Tower A, Quận 1";
const MANAGE = ["installation:read", "installation:manage"];

/** The order's installation as the two reads of the section answer it: a one-row list, then the detail. */
function serve(installation: InstallationDetail | null) {
  apiGet.mockImplementation((url: string) => {
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
    return Promise.resolve({ data: new Blob(["x"]) });
  });
}

function open(
  installation: InstallationDetail | null,
  permissions: string[],
  orderStatus = "in_production",
) {
  granted.value = new Set(permissions);
  serve(installation);
  renderWithProviders(
    <InstallationSection orderId={4} orderStatus={orderStatus} siteAddress={SITE} />,
  );
  return screen.findByText(installation ? I.fields.siteAddress : I.none);
}
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("InstallationSection create", () => {
  it("offers the creation only to installation:manage while the order is in production or delivered", async () => {
    await open(null, MANAGE);
    expect(button(I.create.open)).not.toBeNull();
    cleanup();

    await open(null, MANAGE, "delivered");
    expect(button(I.create.open)).not.toBeNull();
    cleanup();

    await open(null, ["installation:read"]);
    expect(button(I.create.open)).toBeNull();
    cleanup();

    for (const status of ["open", "completed", "cancelled"]) {
      await open(null, MANAGE, status);
      expect(button(I.create.open), status).toBeNull();
      cleanup();
    }
  });

  it("prefills the address from the order and posts what was typed", async () => {
    apiPost.mockResolvedValue({ data: installationDetail() });
    await open(null, MANAGE);

    fireEvent.click(button(I.create.open) as HTMLElement);
    const address = await screen.findByRole("textbox", {
      name: new RegExp(I.fields.siteAddress),
    });
    expect(address).toHaveValue(SITE);
    fireEvent.change(
      screen.getByRole("textbox", {
        name: new RegExp(I.fields.personInCharge),
      }),
      { target: { value: "  Anh Minh  " } },
    );
    fireEvent.change(screen.getByLabelText("date"), {
      target: { value: "2026-12-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: I.create.submit }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/orders/4/installation", {
      siteAddress: SITE,
      plannedDate: "2026-12-10",
      personInCharge: "Anh Minh",
    });
  });
});

describe("InstallationSection steps", () => {
  it("starts only a planned installation, only with installation:manage", async () => {
    await open(installationDetail({ status: "planned" }), MANAGE);
    expect(button(I.actions.start)).not.toBeNull();
    expect(button(I.actions.finish)).toBeNull();
    cleanup();

    await open(installationDetail({ status: "planned" }), ["installation:read"]);
    expect(button(I.actions.start)).toBeNull();
    expect(button(I.actions.finish)).toBeNull();
  });

  it("finishes only an installation in progress, only with installation:manage", async () => {
    await open(installationDetail({ status: "in_progress" }), MANAGE);
    expect(button(I.actions.finish)).not.toBeNull();
    expect(button(I.actions.start)).toBeNull();
    cleanup();

    await open(installationDetail({ status: "in_progress" }), [
      "installation:read",
    ]);
    expect(button(I.actions.finish)).toBeNull();
    cleanup();

    await open(installationDetail({ status: "done" }), MANAGE);
    expect(button(I.actions.start)).toBeNull();
    expect(button(I.actions.finish)).toBeNull();
  });

  it("posts the start step", async () => {
    apiPost.mockResolvedValue({
      data: installationDetail({ status: "in_progress" }),
    });
    await open(installationDetail({ status: "planned" }), MANAGE);

    fireEvent.click(button(I.actions.start) as HTMLElement);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/installations/7/start", {});
  });

  it("shows its own localized sentence, not the server wording, when a step is refused with a 409", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: "Order DH_2026_0001 is open; it cannot be installed." },
      },
    });
    await open(installationDetail({ status: "planned" }), MANAGE);

    fireEvent.click(button(I.actions.start) as HTMLElement);

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith(
        viDelivery.toast.installationConflict,
      ),
    );
  });
});

describe("InstallationSection photos", () => {
  const png = (name = "lap-dat.png") =>
    new File(["x"], name, { type: "image/png" });
  const picker = () =>
    document.querySelector('input[type="file"]') as HTMLInputElement;

  it("uploads a picked photo and refuses a file that is not an image", async () => {
    apiPost.mockResolvedValue({ data: {} });
    await open(installationDetail({ status: "in_progress" }), MANAGE);

    fireEvent.change(picker(), { target: { files: [png("tai-lieu.pdf")] } });
    expect(await screen.findByText(I.photos.problems.type)).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();

    fireEvent.change(picker(), { target: { files: [png()] } });
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0][0]).toBe("/delivery/installations/7/photos");
    expect((apiPost.mock.calls[0][1] as FormData).get("file")).toBeInstanceOf(
      File,
    );
  });

  it("has no picker without installation:manage and none once 30 photos are on", async () => {
    await open(installationDetail(), ["installation:read"]);
    expect(picker()).toBeNull();
    cleanup();

    const photos = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      installationId: 7,
      fileName: `${index + 1}.png`,
      contentType: "image/png",
      sizeBytes: 1,
      createdAt: "2026-11-21T03:00:00.000Z",
    }));
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn();
    await open(installationDetail({ photos }), MANAGE);
    expect(picker()).toBeDisabled();
    expect(
      screen.getByText(I.photos.full.replace("{count}", "30")),
    ).toBeTruthy();
  });
});
