import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QrLinkScanButton } from "@/kernel/core/components/ui/QrLinkScanButton";
import en from "@/kernel/langs/en/common.json";

import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  decode: (_text: string) => undefined as void,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/kernel/core/components/ui/QrCameraScanner", () => ({
  QrCameraScanner: ({
    isOpen,
    onDecode,
    children,
  }: {
    isOpen: boolean;
    onDecode: (text: string) => void;
    children?: ReactNode;
  }) => {
    mocks.decode = onDecode;
    return isOpen ? <div data-testid="scanner">{children}</div> : null;
  },
}));

function renderButton() {
  render(
    <NextIntlClientProvider locale="en" messages={{ common: en }}>
      <QrLinkScanButton />
    </NextIntlClientProvider>,
  );
}

const openScanner = () =>
  fireEvent.click(screen.getByRole("button", { name: en.qrCamera.scanLink }));

beforeEach(() => {
  mocks.push.mockReset();
});

afterEach(cleanup);

describe("qr link scan button", () => {
  it("opens the scanner and follows an in-app link in the same tab", () => {
    renderButton();
    openScanner();
    expect(screen.getByTestId("scanner")).toBeTruthy();

    act(() =>
      mocks.decode(
        `${window.location.origin}/warehouse/raw-material/by-no/NK-1?code=A&line=1`,
      ),
    );

    expect(mocks.push).toHaveBeenCalledWith(
      "/warehouse/raw-material/by-no/NK-1?code=A&line=1",
    );
    expect(screen.queryByTestId("scanner")).toBeNull();
  });

  it("reports a QR that is not an in-app link and keeps scanning", () => {
    renderButton();
    openScanner();

    act(() => mocks.decode("TEM-2026-0001|TP_0011|XLBM-2026-0001|200pcs"));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(en.qrCamera.notAppLink);
    expect(screen.getByTestId("scanner")).toBeTruthy();
  });
});
