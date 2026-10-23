import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";

/** The shape every money/quantity field in this system validates with. */
const schema = z.object({
  shippingFee: z.coerce.number().min(0),
  quantity: z.coerce.number().positive(),
});

interface FormValues {
  shippingFee: string;
  quantity: string;
}

function Harness({
  onSubmit,
}: Readonly<{ onSubmit: (values: unknown) => void }>) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { shippingFee: "", quantity: "" },
  });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormInput
        label="fee"
        type="number"
        placeholder="fee"
        {...form.register("shippingFee")}
      />
      <NumberInput placeholder="qty" {...form.register("quantity")} />
      <button type="submit">go</button>
    </form>
  );
}

describe("what a masked field puts in the payload", () => {
  it("is a number, whatever the separators on screen were", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const fee = screen.getByPlaceholderText("fee");
    fireEvent.change(fee, { target: { value: "1234567,89" } });
    fireEvent.change(screen.getByPlaceholderText("qty"), {
      target: { value: "1500,5" },
    });
    expect(fee).toHaveValue("1.234.567,89");

    fireEvent.click(screen.getByText("go"));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const values = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof values.shippingFee).toBe("number");
    expect(typeof values.quantity).toBe("number");
    // What the API actually receives over the wire.
    expect(JSON.stringify(values)).toBe(
      '{"shippingFee":1234567.89,"quantity":1500.5}',
    );
  });
});
