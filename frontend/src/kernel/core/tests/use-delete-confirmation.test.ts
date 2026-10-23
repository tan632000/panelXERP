import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDeleteConfirmation } from "@/kernel/core/hooks/useDeleteConfirmation";

interface Row {
  id: number;
  code: string;
}

const ROW: Row = { id: 7, code: "M-0007" };

describe("useDeleteConfirmation", () => {
  it("stays closed until a record is requested", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useDeleteConfirmation<Row>(onConfirm));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.target).toBeNull();

    act(() => result.current.confirm());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opens for the requested record and passes it to the delete", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useDeleteConfirmation<Row>(onConfirm));

    act(() => result.current.request(ROW));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.target).toEqual(ROW);

    act(() => result.current.confirm());
    expect(onConfirm).toHaveBeenCalledWith(ROW, expect.any(Function));
  });

  it("keeps the dialog up until the caller closes it", () => {
    let close = () => {};
    const { result } = renderHook(() =>
      useDeleteConfirmation<Row>((_, done) => {
        close = done;
      }),
    );

    act(() => result.current.request(ROW));
    act(() => result.current.confirm());
    // The mutation has not settled yet, so the record it names must stay on screen.
    expect(result.current.isOpen).toBe(true);

    act(() => close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("closes without deleting on cancel", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useDeleteConfirmation<Row>(onConfirm));

    act(() => result.current.request(ROW));
    act(() => result.current.cancel());

    expect(result.current.isOpen).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls the latest delete even though request and cancel keep one identity", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ fn }: { fn: (t: Row, close: () => void) => void }) =>
        useDeleteConfirmation<Row>(fn),
      { initialProps: { fn: first } },
    );

    const request = result.current.request;
    const cancel = result.current.cancel;

    act(() => result.current.request(ROW));
    rerender({ fn: second });

    expect(result.current.request).toBe(request);
    expect(result.current.cancel).toBe(cancel);

    act(() => result.current.confirm());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(ROW, expect.any(Function));
  });
});
