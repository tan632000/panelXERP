import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AxiosError } from "axios";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viRequest from "@/kernel/langs/vi/request.json";

import { EstimatePermission } from "@plugins/sales/estimate/permissions/estimate-permission.keys";
import { AiPrefillPanel } from "@plugins/sales/request/components/AiPrefillPanel";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ can, user: { id: 11, role: "sales" } }),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const POLL_MS = 3000;

function run(
  status: string,
  extra: { error?: string; estimateId?: number; summary?: string } = {},
) {
  return {
    data: {
      status,
      error: extra.error ?? null,
      estimateId: extra.estimateId ?? null,
      summary: extra.summary ?? null,
    },
  };
}

function httpError(status: number) {
  return new AxiosError("failed", String(status), undefined, undefined, {
    status,
    data: {},
    statusText: "",
    headers: {},
    config: {} as never,
  });
}

function respond(attachments: object[] = [{ id: 1 }]) {
  apiGet.mockImplementation((url: string) =>
    url === "/sales/requests/5/attachments"
      ? Promise.resolve({ data: attachments })
      : Promise.resolve(run("queued")),
  );
}

function aiRunCalls() {
  return apiGet.mock.calls.filter(([url]) =>
    String(url).startsWith("/sales/estimates/ai-prefill/"),
  );
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof AiPrefillPanel>> = {},
) {
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
        <AiPrefillPanel
          requestId={5}
          status="draft"
          technicalRequirements="PIR 50mm"
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function startRun() {
  fireEvent.click(await screen.findByText(viRequest.ai.button));
  fireEvent.click(
    await screen.findByRole("button", { name: viRequest.ai.confirmAction }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([EstimatePermission.aiPrefill]);
  respond();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AiPrefillPanel visibility", () => {
  it("offers the button to a permitted user on a draft request", async () => {
    renderPanel();
    expect(await screen.findByText(viRequest.ai.button)).toBeEnabled();
  });

  it("offers nothing without the AI permission", () => {
    granted.value = new Set();
    renderPanel();
    expect(screen.queryByText(viRequest.ai.button)).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("offers nothing once the request is estimated", () => {
    renderPanel({ status: "estimated" });
    expect(screen.queryByText(viRequest.ai.button)).not.toBeInTheDocument();
  });

  it("disables the button with its reason when there is neither text nor file", async () => {
    respond([]);
    renderPanel({ technicalRequirements: "  " });
    expect(await screen.findByText(viRequest.ai.button)).toBeDisabled();
    expect(await screen.findByText(viRequest.ai.noInput)).toBeInTheDocument();
  });
});

describe("AiPrefillPanel while the attachments load", () => {
  it("does not claim there is no input before the file list is known", async () => {
    apiGet.mockImplementation(() => new Promise(() => {}));
    renderPanel({ technicalRequirements: "" });
    expect(await screen.findByText(viRequest.ai.button)).toBeDisabled();
    expect(screen.queryByText(viRequest.ai.noInput)).not.toBeInTheDocument();
  });
});

describe("AiPrefillPanel run", () => {
  it("warns about the external service, then runs to the estimate link", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiPost.mockResolvedValue({ data: { runId: 9 } });
    apiGet.mockImplementation((url: string) => {
      if (url === "/sales/requests/5/attachments") {
        return Promise.resolve({ data: [{ id: 1 }] });
      }
      return Promise.resolve(
        aiRunCalls().length < 2
          ? run("running")
          : run("succeeded", { estimateId: 42, summary: "3 panels drafted" }),
      );
    });
    renderPanel();

    fireEvent.click(await screen.findByText(viRequest.ai.button));
    expect(
      await screen.findByText(viRequest.ai.confirmDescription),
    ).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: viRequest.ai.confirmAction }),
    );

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/sales/estimates/ai-prefill", {
        requestId: 5,
      }),
    );
    expect(await screen.findByText(viRequest.ai.running)).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(await screen.findByText("3 panels drafted")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: viRequest.ai.openEstimate }),
    ).toHaveAttribute("href", "/sales/estimates/42");
  });

  it("shows the reason a run failed", async () => {
    apiPost.mockResolvedValue({ data: { runId: 9 } });
    apiGet.mockImplementation((url: string) =>
      url === "/sales/requests/5/attachments"
        ? Promise.resolve({ data: [{ id: 1 }] })
        : Promise.resolve(run("failed", { error: "AI_TIMEOUT: too slow" })),
    );
    renderPanel();
    await startRun();

    expect(
      await screen.findByText(
        viRequest.ai.failed.replace("{reason}", "AI_TIMEOUT: too slow"),
      ),
    ).toBeInTheDocument();
  });

  it.each([
    [409, viRequest.ai.conflict],
    [503, viRequest.ai.unavailable],
    [429, viRequest.ai.limitReached],
    [500, viRequest.ai.error],
  ])("explains a %s answer in plain words", async (status, text) => {
    apiPost.mockRejectedValue(httpError(status));
    renderPanel();
    await startRun();

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("stops polling when the panel unmounts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiPost.mockResolvedValue({ data: { runId: 9 } });
    apiGet.mockImplementation((url: string) =>
      url === "/sales/requests/5/attachments"
        ? Promise.resolve({ data: [{ id: 1 }] })
        : Promise.resolve(run("running")),
    );
    const view = renderPanel();
    await startRun();
    await screen.findByText(viRequest.ai.running);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    const before = aiRunCalls().length;
    expect(before).toBeGreaterThan(1);

    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 4));

    expect(aiRunCalls()).toHaveLength(before);
  });
});
