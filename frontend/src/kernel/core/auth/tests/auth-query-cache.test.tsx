import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/kernel/core/auth/AuthContext";

const apiPost = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
const fetchItems = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, defaults: { baseURL: "" } },
  PERMISSIONS_STALE_EVENT: "permissions-stale",
  SESSION_EXPIRED_EVENT: "session-expired",
}));

vi.mock("axios", () => ({
  default: { post: vi.fn(() => Promise.resolve({})) },
  isAxiosError: () => false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({ showError: vi.fn() }),
}));

const ENGINEER = {
  user: { id: 30, username: "engineer", role: "engineer" },
  permissions: ["item:read", "reference_price:read"],
};
const STOREKEEPER = {
  user: { id: 41, username: "storekeeper", role: "storekeeper" },
  permissions: ["item:read"],
};

function loginAs(account: typeof ENGINEER) {
  apiPost.mockResolvedValueOnce({
    data: { accessToken: "access", refreshToken: "refresh", ...account },
  });
}

/** Stands in for a page: mounted only while signed in, and its result never goes stale on its own. */
function ItemsProbe() {
  const { data } = useQuery({
    queryKey: ["items", "list"],
    queryFn: fetchItems,
    staleTime: Infinity,
  });
  return <p data-testid="items">{data ?? "loading"}</p>;
}

function Harness() {
  const { login, logout, isAuthenticated } = useAuth();
  return (
    <>
      <button onClick={() => void login("a", "b")}>login</button>
      <button onClick={logout}>logout</button>
      {isAuthenticated && <ItemsProbe />}
    </>
  );
}

function renderApp() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const click = async (name: string) => {
  await act(async () => {
    screen.getByText(name).click();
  });
};

const assignLocation = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom cannot navigate; the stub also records where a sign-out sends the browser.
  vi.stubGlobal("location", { ...window.location, assign: assignLocation });
  // clearAllMocks keeps queued once-values: a test that uses fewer would leak the rest.
  fetchItems.mockReset();
  fetchItems
    .mockResolvedValueOnce("items for the engineer")
    .mockResolvedValueOnce("items for the storekeeper");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthProvider query cache", () => {
  it("sends the browser to the login screen with a full navigation on logout", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("login")).toBeInTheDocument());

    loginAs(ENGINEER);
    await click("login");
    await screen.findByText("items for the engineer");
    await click("logout");

    expect(assignLocation).toHaveBeenCalledWith("/login");
  });

  it("refetches the item query for the next account after a logout and a login", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("login")).toBeInTheDocument());

    loginAs(ENGINEER);
    await click("login");
    expect(
      await screen.findByText("items for the engineer"),
    ).toBeInTheDocument();

    await click("logout");
    loginAs(STOREKEEPER);
    await click("login");

    expect(
      await screen.findByText("items for the storekeeper"),
    ).toBeInTheDocument();
    expect(fetchItems).toHaveBeenCalledTimes(2);
  });

  it("refetches when another account signs in without a logout in between", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("login")).toBeInTheDocument());

    loginAs(ENGINEER);
    await click("login");
    expect(
      await screen.findByText("items for the engineer"),
    ).toBeInTheDocument();

    loginAs(STOREKEEPER);
    await click("login");

    expect(
      await screen.findByText("items for the storekeeper"),
    ).toBeInTheDocument();
    expect(fetchItems).toHaveBeenCalledTimes(2);
  });
});
