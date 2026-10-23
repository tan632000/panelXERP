import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";

afterEach(cleanup);

function renderDialog(
  overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {},
) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = {
    open: true,
    title: "Xoá sản phẩm",
    description: "Bạn có chắc chắn muốn xoá?",
    confirmLabel: "Xoá",
    cancelLabel: "Huỷ",
    onConfirm,
    onCancel,
    ...overrides,
  };
  const view = render(<ConfirmDialog {...props} />);
  return { ...view, onConfirm, onCancel, props };
}

describe("delete confirmation dialog", () => {
  it("renders nothing until it is opened", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before deleting rather than acting on the trigger", () => {
    const { onConfirm } = renderDialog();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the delete once the author confirms", () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByText("Xoá"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("confirms at most once per opening, however many times it is clicked", () => {
    const { onConfirm } = renderDialog();
    const confirm = screen.getByText("Xoá");

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("arms again after the dialog closes and reopens", () => {
    const { onConfirm, rerender, props } = renderDialog();
    fireEvent.click(screen.getByText("Xoá"));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(<ConfirmDialog {...props} open={false} />);
    rerender(<ConfirmDialog {...props} open />);
    fireEvent.click(screen.getByText("Xoá"));

    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("does nothing on cancel", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByText("Huỷ"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe("while the delete is in flight", () => {
    it("disables both controls", () => {
      renderDialog({ pending: true });
      expect(screen.getByText("Xoá")).toBeDisabled();
      expect(screen.getByText("Huỷ")).toBeDisabled();
    });

    it("ignores a further confirm", () => {
      const { onConfirm } = renderDialog({ pending: true });
      fireEvent.click(screen.getByText("Xoá"));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("ignores Escape, so the request is not abandoned mid-flight", () => {
      const { onCancel } = renderDialog({ pending: true });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
