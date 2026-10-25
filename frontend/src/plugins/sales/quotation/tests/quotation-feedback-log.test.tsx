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

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viQuotation from "@/kernel/langs/vi/quotation.json";

import { QuotationFeedbackLog } from "@plugins/sales/quotation/components/feedback/QuotationFeedbackLog";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ can, permissions: [...granted.value] }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

const labels = viQuotation.feedback;
const ENTRIES = [
  {
    id: 2,
    quotationId: 9,
    feedbackDate: "2027-01-12",
    channel: "email",
    content: "Accepts the delivery time",
    createdByName: "Sales A",
  },
  {
    id: 1,
    quotationId: 9,
    feedbackDate: "2027-01-10",
    channel: "phone",
    content: "Asked for a lower price",
    createdByName: "Sales A",
  },
];

function renderLog() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, quotation: viQuotation }}
      >
        <NotificationProvider>
          <QuotationFeedbackLog quotationId={9} />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([
    QuotationPermission.read,
    QuotationPermission.update,
  ]);
  apiGet.mockResolvedValue({ data: ENTRIES });
  apiPost.mockResolvedValue({ data: ENTRIES[0] });
});

afterEach(cleanup);

describe("quotation feedback log", () => {
  it("lists the entries as the server orders them, with date, channel, author and text", async () => {
    renderLog();

    const list = await screen.findByTestId("feedback-entries");
    const items = within(list).getAllByRole("listitem");

    expect(apiGet).toHaveBeenCalledWith("/sales/quotations/9/feedback");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("12/01/2027");
    expect(items[0]).toHaveTextContent(labels.channels.email);
    expect(items[0]).toHaveTextContent("Sales A");
    expect(items[0]).toHaveTextContent("Accepts the delivery time");
    expect(items[1]).toHaveTextContent("10/01/2027");
    expect(items[1]).toHaveTextContent(labels.channels.phone);
  });

  it("says so when there is no feedback yet", async () => {
    apiGet.mockResolvedValue({ data: [] });
    renderLog();

    expect(await screen.findByText(labels.empty)).toBeInTheDocument();
  });

  it("records an entry with the chosen channel and clears the field", async () => {
    renderLog();
    await screen.findByTestId("feedback-entries");
    const add = screen.getByRole("button", { name: labels.add });
    expect(add).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: labels.channels.meeting }));
    const content = screen.getByPlaceholderText(labels.contentPlaceholder);
    fireEvent.change(content, {
      target: { value: "  Will confirm next week " },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.add }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/quotations/9/feedback", {
      feedbackDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
      channel: "meeting",
      content: "Will confirm next week",
    });
    await waitFor(() => expect(content).toHaveValue(""));
  });

  it("is read-only for a reader without quotation:update", async () => {
    granted.value = new Set([QuotationPermission.read]);
    renderLog();

    await screen.findByTestId("feedback-entries");

    expect(screen.queryByRole("button", { name: labels.add })).toBeNull();
    expect(screen.queryByPlaceholderText(labels.contentPlaceholder)).toBeNull();
  });
});
