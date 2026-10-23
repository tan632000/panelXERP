import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { followExcelJob } from "@/kernel/core/lib/excel-job-stream";
import { parseSseBlock, readSseStream } from "@/kernel/core/lib/sse-stream";

const apiGet = vi.hoisted(() => vi.fn());
const token = vi.hoisted(() => ({ value: "tok-1" }));

vi.mock("@/kernel/core/api/api", () => ({
  default: {
    get: apiGet,
    defaults: { baseURL: "http://api.test/api/v1" },
  },
}));
vi.mock("@/kernel/core/auth/tokens", () => ({
  getAccessToken: () => token.value,
}));

/** A 200 event-stream response delivering `chunks` one read at a time. */
function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  token.value = "tok-1";
  fetchMock.mockReset();
  apiGet.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parseSseBlock", () => {
  it("reads the event name and joins data lines", () => {
    expect(parseSseBlock('event: progress\ndata: {"a":\ndata: 1}')).toEqual({
      event: "progress",
      data: '{"a":\n1}',
    });
  });

  it("ignores a keep-alive comment", () => {
    expect(parseSseBlock(": ping")).toBeNull();
  });
});

describe("readSseStream (R7.6)", () => {
  it("sends the token as a Bearer header, never in the URL", async () => {
    fetchMock.mockResolvedValue(streamResponse([]));

    await readSseStream(
      "http://api.test/api/v1/excel/jobs/j1/events",
      new AbortController().signal,
      () => undefined,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/excel/jobs/j1/events");
    expect(url).not.toContain("tok-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-1",
    );
  });

  it("parses events split across chunks and skips comments", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'event: snapshot\ndata: {"state":"act',
        'ive"}\n\n: ping\n\nevent: progress\n',
        'data: {"stage":"writing","percent":40}\n\nevent: completed\ndata: {"rowCount":2}\n\n',
      ]),
    );
    const events: Array<[string, unknown]> = [];

    await readSseStream("u", new AbortController().signal, ({ event, data }) =>
      events.push([event, JSON.parse(data)]),
    );

    expect(events).toEqual([
      ["snapshot", { state: "active" }],
      ["progress", { stage: "writing", percent: 40 }],
      ["completed", { rowCount: 2 }],
    ]);
  });
});

describe("followExcelJob (R7.6)", () => {
  function handlers() {
    return {
      onSnapshot: vi.fn(),
      onProgress: vi.fn(),
      onCompleted: vi.fn(),
      onFailed: vi.fn(),
      onConnectionLost: vi.fn(),
    };
  }

  it("re-reads the snapshot through the API client after a 401, then reopens", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        streamResponse(['event: completed\ndata: {"rowCount":3}\n\n']),
      );
    apiGet.mockImplementation(() => {
      // Stands in for the interceptor's token refresh.
      token.value = "tok-2";
      return Promise.resolve({
        data: { id: "j1", state: "active", stage: "reading", percent: 40 },
      });
    });
    const h = handlers();

    followExcelJob("j1", h);
    await vi.runAllTimersAsync();

    expect(apiGet).toHaveBeenCalledWith("/excel/jobs/j1");
    expect(h.onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 40 }),
    );
    const [, second] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((second.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-2",
    );
    expect(h.onCompleted).toHaveBeenCalledWith({ rowCount: 3 });
    expect(h.onConnectionLost).not.toHaveBeenCalled();
  });

  it("gives up after the third reconnect and reports connectionLost", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("network down"));
    apiGet.mockResolvedValue({
      data: { id: "j1", state: "active", stage: "writing", percent: 50 },
    });
    const h = handlers();

    followExcelJob("j1", h);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(h.onConnectionLost).toHaveBeenCalledTimes(1);
    expect(h.onCompleted).not.toHaveBeenCalled();
  });

  it("settles from a terminal snapshot without reopening", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError("dropped"));
    apiGet.mockResolvedValue({
      data: {
        id: "j1",
        state: "failed",
        stage: "reading",
        percent: 10,
        error: { code: "missingColumns" },
      },
    });
    const h = handlers();

    followExcelJob("j1", h);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.onFailed).toHaveBeenCalledWith({ code: "missingColumns" });
  });
});
