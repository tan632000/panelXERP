import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viDelivery from "@/kernel/langs/vi/delivery.json";

import { DeliveryNoteCreatePage } from "@plugins/delivery/delivery-note/components/DeliveryNoteCreatePage";

import {
  noteDetail,
  orderDetail,
  orderUnit,
  renderWithProviders,
} from "./delivery-note-fixtures";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
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
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/delivery/notes/new",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

/** Units: 11 and 12 are ready; 13 awaits QC; 14 is already on a draft note; 15 failed QC. */
const ORDER = orderDetail({
  units: [
    orderUnit(11),
    orderUnit(12),
    orderUnit(13, { qcStatus: "waiting" }),
    orderUnit(14, { deliveryStatus: "draft", deliveryNoteCode: "PGH_2026_0009" }),
    orderUnit(15, { qcStatus: "failed" }),
  ],
});

const checkbox = (code: string) =>
  screen.getByRole("checkbox", { name: new RegExp(code) }) as HTMLInputElement;

async function pickOrder() {
  const select = await screen.findByRole("combobox", {
    name: viDelivery.note.create.order,
  });
  await screen.findByRole("option", { name: /DH_2026_0001/ });
  fireEvent.change(select, { target: { value: "4" } });
  await screen.findByRole("checkbox", { name: /MSB-01-11/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(["delivery_note:read", "delivery_note:create"]);
  apiGet.mockImplementation((url: string) => {
    if (url === "/delivery/orders/deliverable") {
      return Promise.resolve({
        data: [
          {
            orderId: 4,
            code: "DH_2026_0001",
            customerName: "Alpha Panels",
            projectName: "Tower A",
          },
        ],
      });
    }
    if (url === "/delivery/orders/4") return Promise.resolve({ data: ORDER });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

afterEach(cleanup);

describe("DeliveryNoteCreatePage", () => {
  it("offers only cabinets that passed QC and sit on no live note", async () => {
    renderWithProviders(<DeliveryNoteCreatePage />);
    await pickOrder();

    expect(checkbox("MSB-01-11").disabled).toBe(false);
    expect(checkbox("MSB-01-12").disabled).toBe(false);
    for (const code of ["MSB-01-13", "MSB-01-14", "MSB-01-15"]) {
      expect(checkbox(code).disabled).toBe(true);
    }
  });

  it("keeps submit off until a cabinet is chosen", async () => {
    renderWithProviders(<DeliveryNoteCreatePage />);
    await pickOrder();
    const submit = screen.getByRole("button", {
      name: viDelivery.note.create.submit,
    });

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(checkbox("MSB-01-11"));
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends the order, the chosen cabinets and the prefilled address", async () => {
    apiPost.mockResolvedValue({ data: noteDetail({ id: 7 }) });
    renderWithProviders(<DeliveryNoteCreatePage />);
    await pickOrder();

    expect(
      (
        screen.getByRole("textbox", {
          name: viDelivery.note.fields.address,
        }) as HTMLInputElement
      ).value,
    ).toBe("Công trình Tower A, Quận 1");
    fireEvent.click(checkbox("MSB-01-11"));
    fireEvent.click(checkbox("MSB-01-12"));
    fireEvent.click(
      screen.getByRole("button", { name: viDelivery.note.create.submit }),
    );

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/notes", {
      orderId: 4,
      unitIds: [11, 12],
      deliveryAddress: "Công trình Tower A, Quận 1",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/delivery/notes/7"));
  });

  it("shows a refusal that names cabinet codes on the form", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: "These cabinets cannot be delivered: MSB-01-11, MSB-01-12.",
        },
      },
    });
    renderWithProviders(<DeliveryNoteCreatePage />);
    await pickOrder();
    fireEvent.click(checkbox("MSB-01-11"));
    fireEvent.click(
      screen.getByRole("button", { name: viDelivery.note.create.submit }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("MSB-01-11, MSB-01-12");
    expect(push).not.toHaveBeenCalled();
  });
});
