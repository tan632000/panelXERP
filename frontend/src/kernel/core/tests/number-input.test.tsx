import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NumberInput } from "@/kernel/core/components/ui/NumberInput";

afterEach(cleanup);

/**
 * One keystroke as an input method delivers it: the method rewrites the whole field from its
 * own buffer — duplicating whatever the mask had drawn — and reports that buffer as the
 * event's `data`.
 */
function composeKeystroke(
  input: HTMLInputElement,
  buffer: string,
  fieldText = input.value + buffer,
) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, fieldText);
  fireEvent(
    input,
    new InputEvent("input", {
      bubbles: true,
      data: buffer,
      inputType: "insertCompositionText",
    }),
  );
}

describe("NumberInput", () => {
  it("groups thousands with a dot as the user types", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12");
    fireEvent.change(input, { target: { value: "1234567" } });
    expect(input).toHaveValue("1.234.567");
  });

  it("takes a comma as the decimal separator and drops typed grouping dots", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12");
    fireEvent.change(input, { target: { value: "1234,89" } });
    expect(input).toHaveValue("1.234,89");
  });

  it("reports the stored form, not the displayed one", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NumberInput
        placeholder="12"
        onChange={onChange}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("12"), {
      target: { value: "1234,5" },
    });
    expect(onChange.mock.calls[0][0].target.value).toBe("1234.5");
    expect(onValueChange).toHaveBeenCalledWith(1234.5);
  });

  it("keeps a controlled caller's value formatted", () => {
    function Controlled() {
      const [value, setValue] = useState<string>("");
      return (
        <NumberInput
          placeholder="12"
          min={0}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(<Controlled />);
    const input = screen.getByPlaceholderText("12");
    fireEvent.change(input, { target: { value: "24000" } });
    expect(input).toHaveValue("24.000");
    expect(input).toHaveAttribute("min", "0");
  });

  it("survives a line editor that stores the value back as a number", () => {
    // The shape every converted line table uses: the stored form goes into state as a number
    // and comes back down as `value`. It has to round-trip, or the caller and the mask fight
    // over the field on every keystroke.
    function Line() {
      const [quantity, setQuantity] = useState(0);
      return (
        <NumberInput
          placeholder="12"
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value || 0))}
        />
      );
    }
    render(<Line />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    for (const char of "12345") {
      fireEvent.change(input, { target: { value: input.value + char } });
    }
    expect(input).toHaveValue("12.345");
  });

  it("types over a lone zero instead of typing beside it", () => {
    // The caret lands in front of the placeholder zero as readily as behind it, and a `5`
    // typed there used to read `50`.
    render(<NumberInput placeholder="12" value={0} />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    expect(input).toHaveValue("0");
    fireEvent.change(input, {
      target: { value: "50", selectionStart: 1 },
    });
    expect(input).toHaveValue("5");
  });

  it("keeps a lone zero when the actor opens its decimal part", () => {
    render(<NumberInput placeholder="12" value={0} />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0," } });
    fireEvent.change(input, { target: { value: "0,5" } });
    expect(input).toHaveValue("0,5");
  });

  it("empties when its caller does, the way a money cell does once it is locked", () => {
    const { rerender } = render(<NumberInput placeholder="12" value={4500} />);
    expect(screen.getByPlaceholderText("12")).toHaveValue("4.500");
    rerender(<NumberInput placeholder="12" value="" disabled />);
    expect(screen.getByPlaceholderText("12")).toHaveValue("");
  });

  it("refuses letters, and keeps decimals open on a step-1 field", () => {
    render(<NumberInput placeholder="12" step={1} />);
    const input = screen.getByPlaceholderText("12");
    fireEvent.change(input, { target: { value: "12a,5" } });
    expect(input).toHaveValue("12,5");
  });

  it("takes only whole numbers when the caller asks for them", () => {
    render(<NumberInput placeholder="12" decimalScale={0} />);
    const input = screen.getByPlaceholderText("12");
    fireEvent.change(input, { target: { value: "12,5" } });
    expect(input).toHaveValue("125");
  });

  it("leaves the caret after the comma, so the decimal part can be typed", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "1," } });
    expect(input.selectionStart).toBe(2);
    // The next keystroke lands where the caret sits: the decimal part, not the integer one.
    fireEvent.change(input, { target: { value: "1,2" } });
    expect(input).toHaveValue("1,2");
  });

  it("takes the dot beside the numeric keypad as the decimal separator", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "11111" } });
    expect(input).toHaveValue("11.111");
    // The dot key, typed at the end of a value the mask has already grouped.
    fireEvent.change(input, { target: { value: "11.111." } });
    expect(input).toHaveValue("11.111,");
    fireEvent.change(input, { target: { value: "11.111,2" } });
    expect(input).toHaveValue("11.111,2");
  });

  it("keeps a pasted grouped number grouped, and a pasted decimal decimal", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1.234" } });
    expect(input).toHaveValue("1.234");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "1234.56" } });
    expect(input).toHaveValue("1.234,56");
  });

  it("regroups instead of inventing a decimal when a digit is deleted", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1234" } });
    expect(input).toHaveValue("1.234");
    fireEvent.change(input, { target: { value: "1.23" } });
    expect(input).toHaveValue("123");
  });

  it("still types a decimal after the value was cleared", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "1234,5" } });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "1," } });
    fireEvent.change(input, { target: { value: "1,2" } });
    expect(input).toHaveValue("1,2");
    expect(input.selectionStart).toBe(3);
  });

  it("settles a half-typed decimal on blur", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12");
    fireEvent.change(input, { target: { value: "1500," } });
    expect(input).toHaveValue("1.500,");
    fireEvent.blur(input);
    expect(input).toHaveValue("1.500");
  });

  it("formats a value written straight to the ref, the way react-hook-form resets", () => {
    function WithRef() {
      return (
        <NumberInput
          placeholder="12"
          ref={(node) => {
            if (node) node.value = "98765.4";
          }}
        />
      );
    }
    render(<WithRef />);
    expect(screen.getByPlaceholderText("12")).toHaveValue("98.765,4");
  });

  it("leaves a half-typed decimal alone when a write brings no news", () => {
    // A form re-registering its field writes the value it already holds back into the node,
    // which happens on every keystroke of a watched field. Reformatting on that write would
    // wipe the comma the user has typed but not yet filled in.
    const formHandle: { node: HTMLInputElement | null } = { node: null };
    render(
      <NumberInput
        placeholder="12"
        ref={(node) => {
          formHandle.node = node;
        }}
      />,
    );
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "11111," } });
    expect(input).toHaveValue("11.111,");

    act(() => {
      if (formHandle.node) formHandle.node.value = "11111";
    });
    expect(input).toHaveValue("11.111,");

    act(() => {
      if (formHandle.node) formHandle.node.value = "22222";
    });
    expect(input).toHaveValue("22.222");
  });

  it("spells out a value the language would print with an exponent", () => {
    const { rerender } = render(<NumberInput placeholder="12" value={1e-7} />);
    expect(screen.getByPlaceholderText("12")).toHaveValue("0,0000001");
    rerender(<NumberInput placeholder="12" value={1e21} />);
    expect(screen.getByPlaceholderText("12")).toHaveValue(
      "1.000.000.000.000.000.000.000",
    );
  });

  it("reads a value that comes back already grouped as the number it shows", () => {
    // A stored value carries one dot at most, and it is the decimal point. Several dots can
    // only be grouping, and reading the first one as a decimal point turned 1.234.567 into
    // 1,234 — the field then fed that back as its own value.
    render(<NumberInput placeholder="12" value="1.234.567" />);
    expect(screen.getByPlaceholderText("12")).toHaveValue("1.234.567");
  });

  it("still reads a single dot as the stored decimal point", () => {
    render(<NumberInput placeholder="12" value="1234.5" />);
    expect(screen.getByPlaceholderText("12")).toHaveValue("1.234,5");
  });

  it("groups one keystroke at a time, the way the field is really typed", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;
    for (const char of "12345") {
      fireEvent.change(input, { target: { value: input.value + char } });
    }
    expect(input).toHaveValue("12.345");
  });

  it("keeps grouping on every keystroke while an input method is composing", () => {
    // A Vietnamese keyboard on Linux rewrites the field from its own buffer on every keystroke,
    // so the text in the field is not to be trusted: it used to come back as `123412345`. The
    // event says what the method has composed, and grouping keeps up keystroke by keystroke.
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;

    fireEvent.compositionStart(input);
    const seen: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      const composed = "12345".slice(0, index);
      // The method rewrites the whole field from its buffer, duplicating what the mask drew.
      composeKeystroke(input, composed);
      seen.push(input.value);
    }

    expect(seen).toEqual(["1", "12", "123", "1.234", "12.345"]);

    fireEvent.compositionEnd(input, { data: "12345" });
    expect(input).toHaveValue("12.345");
  });

  it("reports the stored value on every composed keystroke", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NumberInput
        placeholder="12"
        onChange={onChange}
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;

    fireEvent.compositionStart(input);
    composeKeystroke(input, "1234");

    expect(onChange.mock.calls.at(-1)?.[0].target.value).toBe("1234");
    expect(onValueChange).toHaveBeenLastCalledWith(1234);
  });

  it("composes on top of what the field already held", () => {
    render(<NumberInput placeholder="12" defaultValue="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;

    input.setSelectionRange(2, 2);
    fireEvent.compositionStart(input);
    composeKeystroke(input, "345", "12345");
    fireEvent.compositionEnd(input, { data: "345" });

    expect(input).toHaveValue("12.345");
  });

  it("goes back to reading the field once the composition is over", () => {
    render(<NumberInput placeholder="12" />);
    const input = screen.getByPlaceholderText("12") as HTMLInputElement;

    fireEvent.compositionStart(input);
    composeKeystroke(input, "1234");
    fireEvent.compositionEnd(input, { data: "1234" });
    expect(input).toHaveValue("1.234");

    fireEvent.change(input, { target: { value: `${input.value}5` } });
    expect(input).toHaveValue("12.345");
  });

  it("refuses input while disabled", () => {
    render(<NumberInput placeholder="12" disabled />);
    expect(screen.getByPlaceholderText("12")).toBeDisabled();
  });

  it("marks the error state on the control itself", () => {
    render(<NumberInput placeholder="12" error />);
    expect(screen.getByPlaceholderText("12").className).toContain(
      "border-danger-text",
    );
  });
});
