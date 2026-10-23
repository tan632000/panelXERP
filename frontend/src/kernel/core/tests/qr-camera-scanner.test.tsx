import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QrCameraScanner } from "@/kernel/core/components/ui/QrCameraScanner";
import en from "@/kernel/langs/en/common.json";

const mocks = vi.hoisted(() => ({
  results: [] as Array<string | null>,
  decode: vi.fn(),
  drawVideoFrame: vi.fn(),
  decodeQrImageFile: vi.fn(),
}));

vi.mock("@/kernel/core/lib/qr-decoder", () => ({
  createQrDecoder: () => Promise.resolve(mocks.decode),
  drawVideoFrame: mocks.drawVideoFrame,
  decodeQrImageFile: mocks.decodeQrImageFile,
}));

const trackStop = vi.fn();
const applyConstraints = vi.fn();
const getUserMedia = vi.fn();
let capabilities: Record<string, unknown> = {};

function fakeStream() {
  const track = {
    stop: trackStop,
    getCapabilities: () => capabilities,
    applyConstraints,
  };
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}

function renderScanner(onDecode = vi.fn(), onClose = vi.fn(), isOpen = true) {
  const ui = (open: boolean) => (
    <NextIntlClientProvider locale="en" messages={{ common: en }}>
      <QrCameraScanner isOpen={open} onClose={onClose} onDecode={onDecode}>
        <span>overlay</span>
      </QrCameraScanner>
    </NextIntlClientProvider>
  );
  const view = render(ui(isOpen));
  return {
    ...view,
    onDecode,
    onClose,
    rerenderOpen: (o: boolean) => view.rerender(ui(o)),
  };
}

/** Lets the camera start and the scan loop run for `ms`. */
async function run(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function pickPhoto() {
  const input = screen.getByLabelText(en.qrCamera.fromImage);
  fireEvent.change(input, {
    target: { files: [new File(["x"], "qr.png", { type: "image/png" })] },
  });
}

const videoElement = () =>
  document.querySelector("video") as HTMLVideoElement & {
    webkitExitFullscreen?: () => void;
  };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.results = [];
  mocks.decode
    .mockReset()
    .mockImplementation(() => Promise.resolve(mocks.results.shift() ?? null));
  mocks.drawVideoFrame.mockReset().mockReturnValue(true);
  mocks.decodeQrImageFile.mockReset();
  trackStop.mockReset();
  applyConstraints.mockReset().mockResolvedValue(undefined);
  capabilities = {};
  getUserMedia
    .mockReset()
    .mockImplementation(() => Promise.resolve(fakeStream()));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("qr camera scanner", () => {
  it("asks the rear camera at full HD and renders the caller overlay", async () => {
    renderScanner();
    await run();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    expect(screen.getByText("overlay")).toBeTruthy();
  });

  it("marks the preview for inline playback before the stream is attached", async () => {
    renderScanner();
    await run();
    const video = videoElement();
    for (const name of [
      "playsinline",
      "webkit-playsinline",
      "muted",
      "autoplay",
    ]) {
      expect(video.hasAttribute(name)).toBe(true);
    }
    expect(video.hasAttribute("controls")).toBe(false);
  });

  it("closes the native iOS live player and resumes the preview inline", async () => {
    renderScanner();
    await run();
    const video = videoElement();
    const exit = vi.fn();
    video.webkitExitFullscreen = exit;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockClear();
    video.dispatchEvent(new Event("webkitbeginfullscreen"));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("turns on continuous focus when the camera offers it", async () => {
    capabilities = { focusMode: ["manual", "continuous"] };
    renderScanner();
    await run();
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: "continuous" }],
    });
  });

  it("decodes many times a second, reading the whole frame every fourth try", async () => {
    renderScanner();
    await run(80 * 7);
    const fractions = mocks.drawVideoFrame.mock.calls.map((call) => call[2]);
    expect(fractions.slice(0, 8)).toEqual([0.8, 0.8, 0.8, 1, 0.8, 0.8, 0.8, 1]);
  });

  it("fires onDecode once per new text and ignores a code still held in frame", async () => {
    const { onDecode } = renderScanner();
    await run();
    mocks.results = ["A", "A", "A"];
    await run(80 * 3);
    expect(onDecode).toHaveBeenCalledTimes(1);
    mocks.results = ["B"];
    await run(80);
    expect(onDecode).toHaveBeenCalledTimes(2);
    expect(onDecode).toHaveBeenLastCalledWith("B");
    await run(2500);
    mocks.results = ["B"];
    await run(80);
    expect(onDecode).toHaveBeenCalledTimes(3);
  });

  it("shows the unavailable message and keeps the close button working", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("denied"));
    const { onClose } = renderScanner();
    await run();
    expect(screen.getByRole("alert").textContent).toBe(en.qrCamera.unavailable);
    fireEvent.click(screen.getByRole("button", { name: en.qrCamera.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("draws the scan frame while the camera runs", async () => {
    renderScanner();
    await run();
    expect(screen.getByTestId("qr-camera-frame")).toBeTruthy();
    expect(screen.getByText(en.qrCamera.hint)).toBeTruthy();
  });

  it("switches the torch read off the live camera track", async () => {
    capabilities = { torch: true };
    renderScanner();
    await run();
    const torch = screen.getByRole("button", { name: en.qrCamera.torchOn });
    await act(async () => fireEvent.click(torch));
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });
    const lit = screen.getByRole("button", { name: en.qrCamera.torchOff });
    expect(lit.getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.click(lit));
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ torch: false }],
    });
  });

  it("explains a camera without a torch instead of switching it", async () => {
    renderScanner();
    await run();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: en.qrCamera.torchOn }),
      ),
    );
    expect(applyConstraints).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      en.qrCamera.torchUnsupported,
    );
  });

  it("offers the torch only once the camera is running", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("denied"));
    renderScanner();
    await run();
    expect(
      screen.queryByRole("button", { name: en.qrCamera.torchOn }),
    ).toBeNull();
  });

  it("decodes a QR picked from the photo library", async () => {
    mocks.decodeQrImageFile.mockResolvedValueOnce("IMG");
    const { onDecode } = renderScanner();
    await run();
    await act(async () => pickPhoto());
    expect(mocks.decodeQrImageFile).toHaveBeenCalledTimes(1);
    expect(onDecode).toHaveBeenCalledWith("IMG");
  });

  it("reports a photo without a QR and still offers it when the camera failed", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("denied"));
    mocks.decodeQrImageFile.mockResolvedValueOnce(null);
    const { onDecode } = renderScanner();
    await run();
    await act(async () => pickPhoto());
    expect(onDecode).not.toHaveBeenCalled();
    expect(screen.getByText(en.qrCamera.imageUnreadable)).toBeTruthy();
  });

  it("stops the camera and the scan loop when closed", async () => {
    const { rerenderOpen } = renderScanner();
    await run();
    rerenderOpen(false);
    expect(trackStop).toHaveBeenCalledTimes(1);
    const attempts = mocks.drawVideoFrame.mock.calls.length;
    await run(800);
    expect(mocks.drawVideoFrame.mock.calls.length).toBe(attempts);
  });

  it("stops the camera when unmounted", async () => {
    const { unmount } = renderScanner();
    await run();
    unmount();
    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it("stops the camera granted after it was already closed", async () => {
    let resolve: (s: ReturnType<typeof fakeStream>) => void = () => undefined;
    getUserMedia.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { rerenderOpen } = renderScanner();
    rerenderOpen(false);
    await act(async () => resolve(fakeStream()));
    expect(trackStop).toHaveBeenCalledTimes(1);
  });
});
