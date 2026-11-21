import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AxiosError } from "axios";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/kernel/core/components/ui/Toaster";
import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viDelivery from "@/kernel/langs/vi/delivery.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { QcRoundForm } from "@plugins/delivery/qc-inspection/components/QcRoundForm";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), put: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = () => true;
  return {
    useAuth: () => ({
      can,
      permissions: [],
      user: { id: 7, role: "qcInspector" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [] }),
  };
});

const FRAME = { id: 11, name: "Vỏ tủ, sơn và cánh cửa", position: 1 };
const WIRING = { id: 12, name: "Đấu dây đúng bản vẽ", position: 2 };
const TEST = { id: 13, name: "Thử không tải", position: 3 };

let template: Array<{ id: number; name: string; position: number }> = [];

const active = (items: typeof template) =>
  items.map((item) => ({ ...item, active: true }));

/** The cabinet as the server answers a recorded round: the new round is the last one. */
function recorded(results: Array<{ checklistItemId: number }>) {
  return {
    unitId: 5,
    rounds: [
      {
        id: 40,
        roundNo: 1,
        result: "passed",
        inspectedAt: "2026-11-18T01:00:00.000Z",
        inspectorId: 7,
        inspectorName: null,
        items: results.map((result) => ({
          id: 100 + result.checklistItemId,
          checklistItemId: result.checklistItemId,
          name: "",
          position: 1,
          result: "pass",
          note: null,
          photos: [],
        })),
      },
    ],
    defects: [],
  };
}

const failure = (status: number) =>
  new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: {},
    statusText: "",
    headers: {},
    config: {} as never,
  });

function renderForm() {
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
          delivery: viDelivery,
          modal: viModal,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <QcRoundForm unitId={5} />
          <Toaster />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const item = (name: string) => screen.getByRole("group", { name });
const choose = (name: string, result: string) =>
  fireEvent.click(within(item(name)).getByLabelText(result));
const submit = () =>
  screen.getByRole("button", { name: viDelivery.qc.form.submit });
const png = (name = "tu.png") =>
  new File([new Uint8Array(4)], name, { type: "image/png" });
const pick = (name: string, file: File) => {
  const input = item(name).querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

const { pass, fail, na } = viDelivery.qc.form.results;

beforeEach(() => {
  vi.clearAllMocks();
  template = [FRAME, WIRING];
  apiGet.mockImplementation(() => Promise.resolve({ data: active(template) }));
});

afterEach(cleanup);

describe("QcRoundForm", () => {
  it("blocks the submit until every item has a result", async () => {
    renderForm();
    await screen.findByRole("group", { name: FRAME.name });
    expect(submit()).toBeDisabled();

    choose(FRAME.name, pass);
    expect(submit()).toBeDisabled();

    choose(WIRING.name, na);
    expect(submit()).toBeEnabled();
  });

  it("blocks a failed item without a note, and takes it with one", async () => {
    renderForm();
    await screen.findByRole("group", { name: FRAME.name });
    choose(FRAME.name, pass);
    choose(WIRING.name, fail);
    expect(submit()).toBeDisabled();

    fireEvent.change(
      within(item(WIRING.name)).getByPlaceholderText(
        viDelivery.qc.form.noteRequired,
      ),
      { target: { value: "  Dây lỏng ở CB tổng  " } },
    );
    expect(submit()).toBeEnabled();
  });

  it("sends one entry per active item id, with the trimmed note of a failed one", async () => {
    apiPost.mockResolvedValue({
      data: recorded([{ checklistItemId: 11 }, { checklistItemId: 12 }]),
    });
    renderForm();
    await screen.findByRole("group", { name: FRAME.name });
    choose(FRAME.name, pass);
    choose(WIRING.name, fail);
    fireEvent.change(
      within(item(WIRING.name)).getByPlaceholderText(
        viDelivery.qc.form.noteRequired,
      ),
      { target: { value: "  Dây lỏng ở CB tổng  " } },
    );

    fireEvent.click(submit());

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/qc/units/5/rounds", {
      results: [
        { checklistItemId: 11, result: "pass" },
        { checklistItemId: 12, result: "fail", note: "Dây lỏng ở CB tổng" },
      ],
    });
  });

  it("reloads the template on a 409 and keeps the results of the items that stayed", async () => {
    apiPost.mockRejectedValueOnce(failure(409));
    renderForm();
    await screen.findByRole("group", { name: FRAME.name });
    choose(FRAME.name, pass);
    choose(WIRING.name, na);

    // The template moves under the form: the wiring item is hidden and a new one is shown.
    template = [FRAME, TEST];
    fireEvent.click(submit());

    await screen.findByRole("group", { name: TEST.name });
    expect(screen.queryByRole("group", { name: WIRING.name })).toBeNull();
    expect(within(item(FRAME.name)).getByLabelText(pass)).toBeChecked();
    expect(within(item(TEST.name)).getByLabelText(pass)).not.toBeChecked();
    expect(await screen.findByText(viDelivery.toast.qcRoundConflict)).toBeTruthy();
    expect(submit()).toBeDisabled();
  });

  it("uploads the picked photos to the new round items after the round is recorded", async () => {
    apiPost.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith("/rounds")
          ? recorded([{ checklistItemId: 11 }, { checklistItemId: 12 }])
          : { id: 1 },
      }),
    );
    renderForm();
    await screen.findByRole("group", { name: FRAME.name });
    choose(FRAME.name, fail);
    fireEvent.change(
      within(item(FRAME.name)).getByPlaceholderText(
        viDelivery.qc.form.noteRequired,
      ),
      { target: { value: "Sơn xước" } },
    );
    choose(WIRING.name, pass);
    pick(FRAME.name, png("son-xuoc.png"));

    fireEvent.click(submit());

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    expect(apiPost.mock.calls[0][0]).toBe("/delivery/qc/units/5/rounds");
    const [url, body] = apiPost.mock.calls[1] as [string, FormData];
    expect(url).toBe("/delivery/qc/round-items/111/photos");
    expect((body.get("file") as File).name).toBe("son-xuoc.png");
  });

  it("says a photo was too large (413) while the round stays recorded", async () => {
    apiPost
      .mockResolvedValueOnce({ data: recorded([{ checklistItemId: 11 }, { checklistItemId: 12 }]) })
      .mockRejectedValueOnce(failure(413));
    renderForm();
    await screen.findByRole("group", { name: FRAME.name });
    choose(FRAME.name, pass);
    choose(WIRING.name, pass);
    pick(FRAME.name, png());

    fireEvent.click(submit());

    expect(await screen.findByText(viDelivery.toast.photoTooLarge)).toBeTruthy();
    expect(await screen.findByText(viDelivery.toast.qcRoundRecorded)).toBeTruthy();
  });

  it("refuses a picked file of the wrong type without calling the server", async () => {
    renderForm();
    await screen.findByRole("group", { name: FRAME.name });

    pick(FRAME.name, new File([new Uint8Array(4)], "ban-ve.pdf"));

    expect(
      await screen.findByText(viDelivery.qc.form.photoProblems.type),
    ).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
