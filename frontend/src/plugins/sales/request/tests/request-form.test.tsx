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

import viCommon from "@/kernel/langs/vi/common.json";
import viRequest from "@/kernel/langs/vi/request.json";

import { RequestFormModal } from "@plugins/sales/request/components/RequestFormModal";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

// The popup needs real layout to open; a stub button stands in for choosing a customer.
vi.mock("@/kernel/core/components/ui/RecordPickerSourceField", () => ({
  RecordPickerSourceField: ({
    displayLabel,
    onChange,
  }: {
    displayLabel?: string;
    onChange: (customer: { id: number; code: string; name: string }) => void;
  }) => (
    <div>
      <span data-testid="picked">{displayLabel ?? ""}</span>
      <button
        type="button"
        onClick={() =>
          onChange({ id: 7, code: "KH_0007", name: "Alpha Panels" })
        }
      >
        pick-customer
      </button>
    </div>
  ),
}));

function respond() {
  apiGet.mockImplementation((url: string, config?: { params?: object }) => {
    if (url === "/projects") {
      return Promise.resolve({
        data: {
          data: [{ id: 21, code: "DA_0021", name: "Tower A" }],
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        },
      });
    }
    if (url === "/contacts") {
      return Promise.resolve({
        data: {
          data: [
            {
              id: 31,
              customerId: (config?.params as { customerId: number }).customerId,
              name: "Lan Nguyen",
              position: "Buyer",
              isPrimary: true,
            },
          ],
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        },
      });
    }
    return Promise.resolve({ data: null });
  });
}

function renderModal(onCreated = vi.fn()) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, request: viRequest }}
      >
        <RequestFormModal isOpen onClose={vi.fn()} onCreated={onCreated} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onCreated;
}

beforeEach(() => {
  vi.clearAllMocks();
  respond();
});

afterEach(cleanup);

describe("RequestFormModal", () => {
  it("asks nothing about projects or contacts until a customer is chosen, then only about that customer", async () => {
    renderModal();
    expect(apiGet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("pick-customer"));

    await waitFor(() => {
      const urls = apiGet.mock.calls.map(([url]) => url);
      expect(urls).toContain("/projects");
      expect(urls).toContain("/contacts");
    });
    const projectCall = apiGet.mock.calls.find(([url]) => url === "/projects");
    const contactCall = apiGet.mock.calls.find(([url]) => url === "/contacts");
    expect((projectCall?.[1] as { params: object }).params).toMatchObject({
      customerId: 7,
    });
    expect((contactCall?.[1] as { params: object }).params).toMatchObject({
      customerId: 7,
    });
  });

  it("names the missing customer and title when saved empty, and sends nothing", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    expect(
      await screen.findByText(viRequest.validation.customerRequired),
    ).toBeInTheDocument();
    expect(
      screen.getByText(viRequest.validation.titleRequired),
    ).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("sends a trimmed title and the chosen customer, leaving the optional fields out", async () => {
    apiPost.mockResolvedValue({ data: { id: 5, code: "YC_2027_0001" } });
    const onCreated = renderModal();

    fireEvent.click(screen.getByText("pick-customer"));
    fireEvent.change(
      screen.getByPlaceholderText(viRequest.placeholders.title),
      {
        target: { value: "  Panel line quote  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/requests", {
      customerId: 7,
      title: "Panel line quote",
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});
