import { getAccessToken } from "@/kernel/core/auth/tokens";

export interface SseEvent {
  event: string;
  data: string;
}

/** The stream answered with a non-2xx status before sending any event. */
export class SseHttpError extends Error {
  constructor(readonly status: number) {
    super(`Event stream answered ${status}`);
    this.name = "SseHttpError";
  }
}

/**
 * Parses one `text/event-stream` block. Comment lines (`: ping`) are keep-alives and carry
 * nothing; a block holding only comments yields `null`.
 */
export function parseSseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/**
 * Reads a server-sent event stream with `fetch`, so it can send the access token as an
 * `Authorization` header. The browser's `EventSource` cannot send headers, and a token in the
 * query string would end up in access logs.
 *
 * Resolves when the server closes the stream; rejects on a non-2xx answer or a network drop.
 */
export async function readSseStream(
  url: string,
  signal: AbortSignal,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(url, {
    headers: {
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new SseHttpError(response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event);
    }
  }
  const tail = parseSseBlock(buffer + decoder.decode());
  if (tail) onEvent(tail);
}
