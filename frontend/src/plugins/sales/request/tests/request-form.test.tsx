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

import { subscribeToast } from "@/kernel/core/lib/toast";
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
      <button
        type="button"
        onClick={() => onChange({ id: 8, code: "KH_0008", name: "Beta Steel" })}
      >
        pick-other-customer
      </button>
    </div>
  ),
}));

const TOWER_A = {
  id: 21,
  code: "DA_0021",
  name: "Tower A",
  customerId: 7,
  customerCode: "KH_0007",
  customerName: "Alpha Panels",
};

function respond() {
  apiGet.mockImplementation((url: string, config?: { params?: object }) => {
    if (url === "/projects") {
      return Promise.resolve({
        data: {
          data: [TOWER_A],
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
  // jsdom has no layout; the dropdown scrolls its highlighted row into view as the list changes.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

/** Params of every GET to `url`, oldest first. */
const paramsOf = (url: string) =>
  apiGet.mock.calls
    .filter(([called]) => called === url)
    .map(([, config]) => (config as { params: Record<string, unknown> }).params);

const openProjectSelect = () =>
  fireEvent.mouseDown(
    screen.getByPlaceholderText(viRequest.placeholders.project),
  );

/** Chooses customer 7, then Tower A from that customer's projects. */
async function pickCustomerThenProject() {
  fireEvent.click(screen.getByText("pick-customer"));
  await waitFor(() =>
    expect(paramsOf("/projects")).toContainEqual(
      expect.objectContaining({ customerId: 7 }),
    ),
  );
  openProjectSelect();
  fireEvent.mouseDown(
    await screen.findByRole("option", { name: "DA_0021 — Tower A" }),
  );
  await screen.findByDisplayValue("DA_0021 — Tower A");
}

describe("RequestFormModal", () => {
  it("searches every visible project before a customer is chosen, and picking one fills its customer", async () => {
    renderModal();

    openProjectSelect();
    fireEvent.change(await screen.findByPlaceholderText(viCommon.search), {
      target: { value: "Tower" },
    });
    await waitFor(() =>
      expect(paramsOf("/projects")).toContainEqual(
        expect.objectContaining({ search: "Tower" }),
      ),
    );
    // No customer yet, so the search spans every project the server lets this user see.
    expect(
      paramsOf("/projects").every((params) => !("customerId" in params)),
    ).toBe(true);
    expect(paramsOf("/contacts")).toEqual([]);

    fireEvent.mouseDown(
      await screen.findByRole("option", {
        name: "DA_0021 — Tower A (Alpha Panels)",
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("picked")).toHaveTextContent(
        "KH_0007 — Alpha Panels",
      ),
    );
    expect(screen.getByDisplayValue(/DA_0021 — Tower A/)).toBeInTheDocument();
    await waitFor(() =>
      expect(paramsOf("/contacts")).toContainEqual(
        expect.objectContaining({ customerId: 7 }),
      ),
    );
  });

  it("lists only the chosen customer's projects and contacts once a customer is picked", async () => {
    renderModal();
    fireEvent.click(screen.getByText("pick-customer"));

    await waitFor(() => {
      expect(paramsOf("/projects")).toContainEqual(
        expect.objectContaining({ customerId: 7 }),
      );
      expect(paramsOf("/contacts")).toContainEqual(
        expect.objectContaining({ customerId: 7 }),
      );
    });
  });

  it("clears the project when another customer is chosen", async () => {
    renderModal();
    await pickCustomerThenProject();

    fireEvent.click(screen.getByText("pick-other-customer"));

    await waitFor(() =>
      expect(
        screen.queryByDisplayValue("DA_0021 — Tower A"),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the project when the same customer is chosen again", async () => {
    renderModal();
    await pickCustomerThenProject();

    fireEvent.click(screen.getByText("pick-customer"));

    expect(screen.getByDisplayValue("DA_0021 — Tower A")).toBeInTheDocument();
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

  it("creates the request once, then uploads each queued file to it", async () => {
    apiPost.mockResolvedValue({ data: { id: 5, code: "YC_2027_0001" } });
    const onCreated = renderModal();

    fillRequiredFields();
    queueFile("brief.pdf");
    queueFile("layout.dwg");
    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const urls = apiPost.mock.calls.map(([url]) => url);
    // The request has to exist before a file can hang off it.
    expect(urls).toEqual([
      "/sales/requests",
      "/sales/requests/5/attachments",
      "/sales/requests/5/attachments",
    ]);
    const uploaded = apiPost.mock.calls
      .slice(1)
      .map(([, body]) => ((body as FormData).get("file") as File).name);
    expect(uploaded).toEqual(["brief.pdf", "layout.dwg"]);
  });

  it("keeps the created request when a file fails to upload, and names that file", async () => {
    apiPost.mockImplementation((url: string, body?: unknown) => {
      if (url === "/sales/requests") {
        return Promise.resolve({ data: { id: 5, code: "YC_2027_0001" } });
      }
      const name = ((body as FormData).get("file") as File).name;
      return name === "broken.pdf"
        ? Promise.reject(new Error("upload failed"))
        : Promise.resolve({ data: { id: 1 } });
    });
    const toasts: string[] = [];
    const unsubscribe = subscribeToast(({ message }) => toasts.push(message));
    const onCreated = renderModal();

    fillRequiredFields();
    queueFile("broken.pdf");
    queueFile("layout.dwg");
    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    unsubscribe();
    expect(
      apiPost.mock.calls.filter(([url]) => url === "/sales/requests"),
    ).toHaveLength(1);
    expect(toasts).toContain(
      viRequest.toast.uploadFailed.replace("{names}", "broken.pdf"),
    );
  });
});

function fillRequiredFields() {
  fireEvent.click(screen.getByText("pick-customer"));
  fireEvent.change(screen.getByPlaceholderText(viRequest.placeholders.title), {
    target: { value: "Panel line quote" },
  });
}

/** Picks one file through the create form's attachment picker. */
function queueFile(name: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("the create form has no file picker");
  fireEvent.change(input, {
    target: { files: [new File(["%PDF-1.7"], name)] },
  });
}
