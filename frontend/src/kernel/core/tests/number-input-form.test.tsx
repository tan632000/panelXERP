import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm, useWatch } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";

afterEach(cleanup);

interface Values {
  unitPrice: string;
}

/** The way every line editor wires the control: `register`, then read the form values. */
function Harness({
  onSubmit,
}: Readonly<{ onSubmit: (values: Values) => void }>) {
  const form = useForm<Values>({ defaultValues: { unitPrice: "" } });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <NumberInput
        placeholder="0"
        aria-label="unit price"
        {...form.register("unitPrice")}
      />
      <button type="submit">submit</button>
      <button
        type="button"
        onClick={() => form.reset({ unitPrice: "1234567.89" })}
      >
        reset
      </button>
    </form>
  );
}

describe("NumberInput inside react-hook-form", () => {
  it("submits the stored form of what was typed", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("unit price"), {
      target: { value: "1234567,89" },
    });
    expect(screen.getByLabelText("unit price")).toHaveValue("1.234.567,89");

    fireEvent.click(screen.getByText("submit"));
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { unitPrice: "1234567.89" },
        expect.anything(),
      ),
    );
  });

  it("shows a reset value formatted, since the form writes it to the node", async () => {
    render(<Harness onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("reset"));
    await vi.waitFor(() =>
      expect(screen.getByLabelText("unit price")).toHaveValue("1.234.567,89"),
    );
  });

  it("keeps the field name reachable through the ref the form holds", () => {
    const seen: string[] = [];
    render(
      <NumberInput
        aria-label="qty"
        name="quantity"
        ref={(node) => {
          if (node) seen.push(node.name, node.type, String(node.disabled));
        }}
      />,
    );
    expect(seen).toEqual(["quantity", "text", "false"]);
  });
});

/** A labelled field that re-renders on every keystroke, the way a form watching a total does. */
function WatchedHarness() {
  const form = useForm<Values>({ defaultValues: { unitPrice: "" } });
  const unitPrice = useWatch({ control: form.control, name: "unitPrice" });
  return (
    <>
      <FormInput
        label="unit price"
        type="number"
        step="any"
        {...form.register("unitPrice")}
      />
      <output>{unitPrice}</output>
    </>
  );
}

describe("NumberInput inside a watched react-hook-form field", () => {
  it("keeps the decimal comma while the form re-registers the field", () => {
    render(<WatchedHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "11111" } });
    expect(input).toHaveValue("11.111");
    // Each keystroke re-renders, and re-registering writes the stored value back into the
    // node. That write carries no news and must leave the half-typed decimal alone.
    fireEvent.change(input, { target: { value: "11.111," } });
    expect(input).toHaveValue("11.111,");
    fireEvent.change(input, { target: { value: "11.111,2" } });
    expect(input).toHaveValue("11.111,2");
    expect(screen.getByText("11111.2")).toBeInTheDocument();
  });
});
