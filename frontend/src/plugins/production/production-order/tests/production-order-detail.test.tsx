import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viProduction from "@/kernel/langs/vi/production.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { ProductionOrderDetailPage } from "@plugins/production/production-order/components/ProductionOrderDetailPage";
import { ProductionOrderPermission } from "@plugins/production/production-order/permissions/production-order-permission.keys";

import type {
  ProductionOrderDetail,
  ProductionShortItem,
} from "@plugins/production/production-order/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: apiPatch, delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) => granted.value.has(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [...granted.value],
      user: { id: 50, role: "productionManager" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "3" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production/orders/3",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const TECHNICIANS = [
  { id: 61, name: "Kỹ thuật A" },
  { id: 62, name: "Kỹ thuật B" },
];

function order(
  overrides: Partial<ProductionOrderDetail> = {},
): ProductionOrderDetail {
  return {
    id: 3,
    code: "LSX_2026_0003",
    orderId: 7,
    orderCode: "DH_2026_0007",
    status: "draft",
    customerName: "Công ty Điện Nam",
    deliveryDate: "2026-12-01",
    unitCount: 2,
    createdAt: "2026-10-30T08:00:00.000Z",
    releasedAt: null,
    cancelReason: null,
    cancelledAt: null,
    completedAt: null,
    units: [
      {
        id: 31,
        code: "MSB-01-1",
        tag: "MSB-01",
        description: "Main switchboard",
        orderLineId: 1,
        assigneeId: 61,
        assigneeName: "Kỹ thuật A",
        plannedEndDate: "2026-11-20",
        doneCount: 2,
        currentStage: "device_mounting",
      },
      {
        id: 32,
        code: "MSB-01-2",
        tag: "MSB-01",
        description: "Main switchboard",
        orderLineId: 1,
        assigneeId: null,
        assigneeName: null,
        plannedEndDate: null,
        doneCount: 0,
        currentStage: "material_prep",
      },
    ],
    events: [],
    ...overrides,
  };
}

let shortage: ProductionShortItem[] = [];

function respond(detail: ProductionOrderDetail) {
  apiGet.mockImplementation((url: string) => {
    if (url === "/production/orders/3") {
      return Promise.resolve({ data: detail });
    }
    if (url === "/production/technician-options") {
      return Promise.resolve({ data: TECHNICIANS });
    }
    if (url === "/production/orders/3/shortage") {
      return Promise.resolve({ data: shortage });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{
          common: viCommon,
          modal: viModal,
          production: viProduction,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <ProductionOrderDetailPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const assigneeLabel = (code: string) =>
  viProduction.units.assigneeOf.replace("{code}", code);

beforeEach(() => {
  vi.clearAllMocks();
  shortage = [];
  granted.value = new Set(Object.values(ProductionOrderPermission));
  respond(order());
});

afterEach(cleanup);

describe("ProductionOrderDetailPage", () => {
  it("lists the technician options in each cabinet picker and assigns the one picked", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();

    const picker = await screen.findByLabelText(assigneeLabel("MSB-01-2"));
    await waitFor(() =>
      expect(
        Array.from(picker.querySelectorAll("option")).map(
          (option) => option.textContent,
        ),
      ).toEqual([
        viProduction.units.pickTechnician,
        "Kỹ thuật A",
        "Kỹ thuật B",
      ]),
    );

    fireEvent.change(picker, { target: { value: "62" } });

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/32", {
        assigneeId: 62,
      }),
    );
  });

  /** A save is sent after a microtask; let it go out before asserting that none was. */
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

  const dateField = async (code: string) => {
    const row = (await screen.findByLabelText(assigneeLabel(code))).closest(
      "tr",
    ) as HTMLElement;
    return within(row).getByPlaceholderText("dd/mm/yyyy");
  };

  it("saves a typed planned end date once, when the field is left", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();
    const date = await dateField("MSB-01-2");
    date.focus();

    // Typed key by key, "25/11/2" already parses, as year 0002.
    fireEvent.change(date, { target: { value: "25/11/2" } });
    fireEvent.change(date, { target: { value: "25/11/20" } });
    fireEvent.change(date, { target: { value: "25/11/202" } });
    fireEvent.change(date, { target: { value: "25/11/2026" } });
    await settle();
    expect(apiPatch).not.toHaveBeenCalled();

    fireEvent.blur(date);
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/32", {
        plannedEndDate: "2026-11-25",
      }),
    );
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  it("does not save the day of a date being retyped until it is whole", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();

    // Replacing "20" with "26": the first key alone is a valid date, the 2nd.
    fireEvent.change(date, { target: { value: "2/11/2026" } });
    fireEvent.change(date, { target: { value: "26/11/2026" } });
    await settle();
    expect(apiPatch).not.toHaveBeenCalled();

    fireEvent.keyDown(date, { key: "Enter" });
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/31", {
        plannedEndDate: "2026-11-26",
      }),
    );
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  /** Moves focus onto a calendar day, as the mouse press does, then clicks it. */
  const pickDay = (day: string) => {
    const cell = document.querySelector<HTMLElement>(
      `.react-datepicker__day--0${day}:not(.react-datepicker__day--outside-month)`,
    );
    if (!cell) throw new Error(`no calendar day ${day}`);
    act(() => cell.focus());
    fireEvent.click(cell);
  };

  it("saves the day picked on the calendar, not the date typed before it", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();
    fireEvent.change(date, { target: { value: "2/11/2026" } });
    // A date that parses closes the calendar; the field is clicked again to open it.
    fireEvent.click(date);

    pickDay("26");

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/31", {
        plannedEndDate: "2026-11-26",
      }),
    );
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  it("waits for the calendar while a press on it leaves no focus target", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();
    fireEvent.change(date, { target: { value: "2/11/2026" } });
    fireEvent.click(date);

    // Safari's month buttons, or the calendar's blank space, blur the field towards nothing.
    act(() => date.blur());
    await settle();
    expect(apiPatch).not.toHaveBeenCalled();

    pickDay("26");
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/31", {
        plannedEndDate: "2026-11-26",
      }),
    );
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  it("saves the typed date when the calendar closes after focus left it", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();
    fireEvent.change(date, { target: { value: "26/11/2026" } });
    fireEvent.click(date);
    act(() => date.blur());
    await settle();
    expect(apiPatch).not.toHaveBeenCalled();

    // A press outside the calendar closes it.
    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/31", {
        plannedEndDate: "2026-11-26",
      }),
    );
  });

  it("keeps the typed date when a calendar day loses focus before the calendar closes", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();
    fireEvent.change(date, { target: { value: "26/11/2026" } });
    fireEvent.click(date);
    act(() => date.blur());

    // A second press on the calendar's blank space moves focus off the day the picker focused,
    // after the picker has already put the saved date back into the field.
    const day = document.querySelector<HTMLElement>(
      ".react-datepicker__day--020:not(.react-datepicker__day--outside-month)",
    );
    if (!day) throw new Error("no calendar day 20");
    act(() => day.focus());
    act(() => day.blur());
    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/31", {
        plannedEndDate: "2026-11-26",
      }),
    );
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  it("saves nothing when the text left is not a date, though a part of it was", async () => {
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();

    // "3/11/2026" is a date; "31/11/2026" is not, though the picker last reported the 3rd.
    fireEvent.change(date, { target: { value: "3/11/2026" } });
    fireEvent.change(date, { target: { value: "31/11/2026" } });
    act(() => date.blur());

    await settle();
    expect(apiPatch).not.toHaveBeenCalled();
    expect(date).toHaveValue("20/11/2026");

    // Leaving the field again still saves nothing.
    act(() => date.focus());
    act(() => date.blur());
    await settle();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("saves a date typed back to one the picker already reported", async () => {
    apiPatch.mockResolvedValue({ data: order() });
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();

    // The picker reports nothing for a date equal to the one it last reported.
    fireEvent.change(date, { target: { value: "3/11/2026" } });
    fireEvent.change(date, { target: { value: "3/11/202" } });
    fireEvent.change(date, { target: { value: "3/11/2026" } });
    fireEvent.keyDown(date, { key: "Enter" });

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/production/orders/3/units/31", {
        plannedEndDate: "2026-11-03",
      }),
    );
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  it("saves nothing when the saved day is picked again after typing", async () => {
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();
    fireEvent.change(date, { target: { value: "2/11/2026" } });
    // A date that parses closes the calendar; the field is clicked again to open it.
    fireEvent.click(date);

    pickDay("20");
    fireEvent.blur(date);

    await settle();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("shows the saved date again when the change is refused", async () => {
    apiPatch.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Cabinet is finished." } },
    });
    renderPage();
    const date = await dateField("MSB-01-1");
    date.focus();
    fireEvent.change(date, { target: { value: "26/11/2026" } });

    fireEvent.blur(date);

    await waitFor(() => expect(date).toHaveValue("20/11/2026"));
  });

  it("shows the cabinet codes a release refused for lacking a technician or a date", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message:
            "Every cabinet needs a technician and a planned end date: MSB-01-2, MSB-02-1.",
        },
      },
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: viProduction.actions.release }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: viProduction.actions.release,
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      viProduction.actions.releaseIncomplete.replace(
        "{codes}",
        "MSB-01-2, MSB-02-1",
      ),
    );
    expect(apiPost).toHaveBeenCalledWith("/production/orders/3/release", {});
  });

  it("cancels with the reason typed", async () => {
    apiPost.mockResolvedValue({ data: order({ status: "cancelled" }) });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: viProduction.actions.cancel }),
    );
    const reason = await screen.findByPlaceholderText(
      viProduction.reason.placeholder,
    );
    const dialog = reason.closest("form") as HTMLElement;
    fireEvent.change(reason, {
      target: { value: "Khách hoãn" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: viProduction.actions.cancel }),
    );

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/production/orders/3/cancel", {
        reason: "Khách hoãn",
      }),
    );
  });

  it("is read-only for a holder of production_order:read alone", async () => {
    granted.value = new Set([ProductionOrderPermission.read]);
    renderPage();

    expect(await screen.findByText("MSB-01-1")).toBeInTheDocument();
    expect(screen.getByText("Kỹ thuật A")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(assigneeLabel("MSB-01-1")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viProduction.actions.release }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viProduction.actions.cancel }),
    ).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith(
      "/production/technician-options",
      expect.anything(),
    );
  });

  it("offers neither release nor cancel once the order is completed", async () => {
    respond(order({ status: "completed" }));
    renderPage();

    await screen.findByText("MSB-01-1");
    expect(
      screen.queryByRole("button", { name: viProduction.actions.release }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viProduction.actions.cancel }),
    ).not.toBeInTheDocument();
  });
});

describe("ProductionOrderDetailPage shortage panel", () => {
  it("shows what the order is short of and refuses nothing because of it", async () => {
    shortage = [
      {
        itemId: 101,
        itemCode: "VT-X",
        itemName: "Aptomat 3P",
        itemUnit: "Cái",
        demand: 6,
        reserved: 4,
        short: 2,
      },
    ];
    respond(order({ status: "released" }));
    renderPage();

    expect(
      await screen.findByText(viProduction.shortage.title),
    ).toBeInTheDocument();
    expect((await screen.findByTestId("short-101")).textContent).toBe("2");
    expect(screen.getByText("VT-X")).toBeInTheDocument();
  });

  it("says so when every material is covered", async () => {
    renderPage();

    expect(
      await screen.findByText(viProduction.shortage.none),
    ).toBeInTheDocument();
  });

  it("hides the panel for a cancelled order", async () => {
    respond(order({ status: "cancelled" }));
    renderPage();

    await screen.findByText("MSB-01-1");
    expect(
      screen.queryByText(viProduction.shortage.title),
    ).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith("/production/orders/3/shortage");
  });

  it("shows how many of the six stages each cabinet has done and where it stands", async () => {
    renderPage();

    await screen.findByText("MSB-01-1");
    expect(screen.getByText("2/6")).toBeInTheDocument();
    expect(
      screen.getByText(viProduction.stages.device_mounting),
    ).toBeInTheDocument();
    expect(screen.getByText("0/6")).toBeInTheDocument();
    expect(
      screen.getByText(viProduction.stages.material_prep),
    ).toBeInTheDocument();
  });
});
