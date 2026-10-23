import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileInput } from "@/kernel/core/components/ui/FileInput";

afterEach(cleanup);

const LABELS = { chooseLabel: "Chọn tệp", emptyLabel: "Chưa chọn tệp" };

function pick(name: string) {
  return new File(["x"], name, { type: "application/pdf" });
}

describe("FileInput", () => {
  it("shows the empty label until a file is picked", () => {
    render(<FileInput {...LABELS} onPick={vi.fn()} />);
    expect(screen.getByText("Chưa chọn tệp")).toBeInTheDocument();
  });

  it("shows the picked file name instead of the empty label", () => {
    render(<FileInput {...LABELS} fileName="nda.pdf" onPick={vi.fn()} />);
    expect(screen.getByText("nda.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Chưa chọn tệp")).not.toBeInTheDocument();
  });

  it("hands the picked file to the caller", () => {
    const onPick = vi.fn();
    const { container } = render(
      <FileInput {...LABELS} accept=".pdf" onPick={onPick} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pick("nda.pdf")] } });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].name).toBe("nda.pdf");
  });

  it("clears the native value so the same file can be picked twice", () => {
    const onPick = vi.fn();
    const { container } = render(<FileInput {...LABELS} onPick={onPick} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pick("nda.pdf")] } });
    expect(input.value).toBe("");
  });

  it("ignores a cancelled dialog", () => {
    const onPick = vi.fn();
    const { container } = render(<FileInput {...LABELS} onPick={onPick} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("forwards the accepted extensions to the native input", () => {
    const { container } = render(
      <FileInput {...LABELS} accept=".pdf,.docx" onPick={vi.fn()} />,
    );
    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      "accept",
      ".pdf,.docx",
    );
  });

  it("disables both the button and the native input", () => {
    const { container } = render(
      <FileInput {...LABELS} disabled onPick={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Chọn tệp/ })).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
  });
});
