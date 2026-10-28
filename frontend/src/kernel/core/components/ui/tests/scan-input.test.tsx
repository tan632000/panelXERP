import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScanInput } from "@/kernel/core/components/ui/ScanInput";

afterEach(cleanup);

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The deferred promise of the next call, in order. */
function next<T>(queue: Array<Deferred<T>>): Promise<T> {
  const head = queue.shift();
  if (!head) throw new Error("No answer queued");
  return head.promise;
}

function setup(
  resolve: (value: string) => Promise<string>,
  extra: { disabled?: boolean } = {},
) {
  const onResult = vi.fn();
  const view = render(
    <ScanInput
      resolve={resolve}
      onResult={onResult}
      errorMessage={() => "Không tìm thấy"}
      placeholder="Quét mã"
      {...extra}
    />,
  );
  const input = screen.getByPlaceholderText("Quét mã") as HTMLInputElement;
  /** What a keyboard-wedge scanner does: types the code, then Enter. */
  const scan = (code: string) => {
    fireEvent.change(input, { target: { value: code } });
    fireEvent.keyDown(input, { key: "Enter" });
  };
  return { ...view, input, onResult, scan };
}

describe("ScanInput", () => {
  it("takes the focus when it appears", () => {
    const { input } = setup(() => Promise.resolve("x"));

    expect(input).toHaveFocus();
  });

  it("submits the trimmed value once on Enter, clears and refocuses", async () => {
    const resolve = vi.fn((value: string) => Promise.resolve(`item:${value}`));
    const { input, onResult, scan } = setup(resolve);

    scan("  ABC ");

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("ABC");
    expect(input.value).toBe("");
    await vi.waitFor(() =>
      expect(onResult).toHaveBeenCalledWith("item:ABC", "ABC"),
    );
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
  });

  it("ignores Enter on an empty or blank value", () => {
    const resolve = vi.fn(() => Promise.resolve("x"));
    const { scan } = setup(resolve);

    scan("");
    scan("   ");

    expect(resolve).not.toHaveBeenCalled();
  });

  it("ignores keys other than Enter", () => {
    const resolve = vi.fn(() => Promise.resolve("x"));
    const { input } = setup(resolve);

    fireEvent.change(input, { target: { value: "ABC" } });
    fireEvent.keyDown(input, { key: "a" });

    expect(resolve).not.toHaveBeenCalled();
    expect(input.value).toBe("ABC");
  });

  it("applies only the newest result when the first answer arrives last", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const answers = [first, second];
    const resolve = vi.fn(() => next(answers));
    const { onResult, scan } = setup(resolve);

    scan("FIRST");
    scan("SECOND");
    second.resolve("second-result");
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    first.resolve("first-result");
    await first.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("second-result", "SECOND");
  });

  it("drops a late failure of an older scan", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const answers = [first, second];
    const { onResult, scan } = setup(() => next(answers));

    scan("FIRST");
    scan("SECOND");
    second.resolve("second-result");
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    first.reject(new Error("404"));
    await first.promise.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error inline, keeps the focus and clears it on the next scan", async () => {
    const resolve = vi
      .fn<(value: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce("found");
    const { input, onResult, scan } = setup(resolve);

    scan("NOPE");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không tìm thấy",
    );
    expect(onResult).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input.value).toBe("");

    scan("YES");

    await vi.waitFor(() =>
      expect(onResult).toHaveBeenCalledWith("found", "YES"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hands nothing to the host once it is unmounted", async () => {
    const pending = deferred<string>();
    const { onResult, scan, unmount } = setup(() => pending.promise);

    scan("LATE");
    unmount();
    pending.resolve("late-result");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onResult).not.toHaveBeenCalled();
  });

  it("takes no scan while the host disables it", () => {
    const resolve = vi.fn(() => Promise.resolve("x"));
    const { input } = setup(resolve, { disabled: true });

    expect(input).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(resolve).not.toHaveBeenCalled();
  });
});
