import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viDelivery from "@/kernel/langs/vi/delivery.json";

import { OrderDeliveryPage } from "@plugins/delivery/delivery-note/components/OrderDeliveryPage";

import {
  noteDetail,
  orderDetail,
  orderUnit,
  renderWithProviders,
} from "./delivery-note-fixtures";

const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

const NOTE = noteDetail({ status: "shipped", unitCount: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  // A storekeeper: the delivery page is readable without any order permission.
  granted.value = new Set(["delivery_note:read"]);
  apiGet.mockResolvedValue({
    data: orderDetail({
      units: [
        orderUnit(11),
        orderUnit(12, {
          qcStatus: "waiting",
          deliveryStatus: "shipped",
          deliveryNoteCode: "PGH_2026_0001",
        }),
      ],
      notes: [NOTE],
    }),
  });
});

afterEach(cleanup);

describe("OrderDeliveryPage", () => {
  it("renders the cabinets with both statuses for a reader without order:read", async () => {
    renderWithProviders(<OrderDeliveryPage />);

    const ready = (await screen.findByText("MSB-01-11")).closest("li");
    expect(within(ready as HTMLElement).getByText("Đạt")).toBeTruthy();
    expect(
      within(ready as HTMLElement).getByText(
        viDelivery.note.unitStatuses.none,
      ),
    ).toBeTruthy();
    const onNote = screen.getByText("MSB-01-12").closest("li");
    expect(within(onNote as HTMLElement).getByText("Chờ QC")).toBeTruthy();
    expect(
      within(onNote as HTMLElement).getByText(
        viDelivery.note.unitStatuses.shipped,
      ),
    ).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/delivery/orders/4");
  });

  it("shows the order, its customer, the project and the notes with a link each", async () => {
    renderWithProviders(<OrderDeliveryPage />);

    await screen.findByText("MSB-01-11");
    expect(screen.getAllByText("DH_2026_0001").length).toBeGreaterThan(0);
    expect(screen.getByText("Alpha Panels")).toBeTruthy();
    expect(screen.getByText(viDelivery.note.fields.project)).toBeTruthy();
    expect(screen.getByText("Tower A")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "PGH_2026_0001" }),
    ).toHaveAttribute("href", "/delivery/notes/5");
  });

  it("renders no money field", async () => {
    const { container } = renderWithProviders(<OrderDeliveryPage />);

    await screen.findByText("MSB-01-11");
    expect(container.textContent).not.toMatch(/₫|VND|giá|tổng tiền/i);
  });
});
