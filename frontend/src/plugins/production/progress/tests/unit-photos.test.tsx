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
import viModal from "@/kernel/langs/vi/modal.json";
import viProduction from "@/kernel/langs/vi/production.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { UnitPhotos } from "@plugins/production/progress/components/UnitPhotos";
import { PHOTO_MAX_BYTES } from "@plugins/production/progress/constants";
import { photoFileProblem } from "@plugins/production/progress/utils/photo-file";

import type { UnitPhoto } from "@plugins/production/progress/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
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
      user: { id: 61, role: "technician" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

function photo(overrides: Partial<UnitPhoto> = {}): UnitPhoto {
  return {
    id: 11,
    unitId: 5,
    stage: "wiring",
    issueId: null,
    fileName: "dau-day.png",
    contentType: "image/png",
    sizeBytes: 2048,
    uploadedBy: 61,
    uploadedByName: "Kỹ thuật A",
    createdAt: "2026-11-02T01:00:00.000Z",
    ...overrides,
  };
}

function show(photos: UnitPhoto[]) {
  apiGet.mockImplementation((url: string) => {
    if (url.endsWith("/photos")) return Promise.resolve({ data: photos });
    if (url.endsWith("/content")) {
      return Promise.resolve({
        data: new Blob(["png"], { type: "image/png" }),
      });
    }
    return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
  });
}

function renderPhotos(canUpload = true) {
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
          <UnitPhotos unitId={5} currentStage="wiring" canUpload={canUpload} />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const file = (name: string, bytes = 4) =>
  new File([new Uint8Array(bytes)], name, { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(["production_issue:read"]);
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
  show([]);
});

afterEach(cleanup);

describe("photoFileProblem", () => {
  it.each([
    ["site.png", 10, null],
    ["site.JPG", 10, null],
    ["site.jpeg", 10, null],
    ["plan.pdf", 10, "type"],
    ["site", 10, "type"],
    ["site.png", 0, "empty"],
    ["site.png", PHOTO_MAX_BYTES + 1, "size"],
  ])("%s of %i bytes: %s", (name, size, problem) => {
    expect(photoFileProblem(file(name, size))).toBe(problem);
  });
});

describe("UnitPhotos", () => {
  it("groups the photos by stage and shows each image", async () => {
    show([
      photo(),
      photo({ id: 12, stage: "enclosure", fileName: "vo-tu.jpg" }),
    ]);
    renderPhotos();

    const wiring = await screen.findByRole("region", {
      name: viProduction.stages.wiring,
    });
    expect(await within(wiring).findByAltText("dau-day.png")).toHaveAttribute(
      "src",
      "blob:photo",
    );
    const enclosure = screen.getByRole("region", {
      name: viProduction.stages.enclosure,
    });
    expect(await within(enclosure).findByAltText("vo-tu.jpg")).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/production/photos/11/content", {
      responseType: "blob",
    });
  });

  it("says so when there are no photos", async () => {
    renderPhotos();
    expect(await screen.findByText(viProduction.photos.empty)).toBeTruthy();
  });

  it("uploads a picked photo to the stage being worked", async () => {
    apiPost.mockResolvedValue({ data: photo({ id: 13 }) });
    const { container } = renderPhotos();
    await screen.findByText(viProduction.photos.empty);

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("new.png")] } });

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = apiPost.mock.calls[0] as [string, FormData];
    expect(url).toBe("/production/units/5/photos");
    expect(body.get("stage")).toBe("wiring");
    expect(body.get("issueId")).toBeNull();
    expect((body.get("file") as File).name).toBe("new.png");
  });

  it("refuses a file of the wrong type without calling the server", async () => {
    const { container } = renderPhotos();
    await screen.findByText(viProduction.photos.empty);

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("plan.pdf")] } });

    expect(
      await screen.findByText(viProduction.photos.problems.type),
    ).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("offers no picker to someone who cannot upload", async () => {
    show([photo()]);
    const { container } = renderPhotos(false);

    await screen.findByRole("region", { name: viProduction.stages.wiring });
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
