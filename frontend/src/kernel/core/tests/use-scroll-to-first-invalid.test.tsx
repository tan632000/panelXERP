import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { useScrollToFirstInvalid } from "@/kernel/core/hooks/useScrollToFirstInvalid";

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  // The hook defers its read to the next frame; run it straight away.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Stands in for a long form whose first two fields are fine and whose third is not — the
 * shape that hid the failure: the rejected control was rendered below the fold, so the submit
 * looked like it had done nothing.
 */
function Harness({ picker = false }: { picker?: boolean }) {
  const { containerRef, scrollToFirstInvalid } =
    useScrollToFirstInvalid<HTMLDivElement>();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        scrollToFirstInvalid();
      }}
    >
      <div ref={containerRef}>
        <FormInput label="first" value="ok" readOnly />
        <FormInput label="second" value="ok" readOnly />
        {picker ? (
          // A control the module does not own: no input of its own to focus.
          <FormControl label="third" error="required">
            <div data-testid="picked" />
          </FormControl>
        ) : (
          <FormInput
            label="third"
            value=""
            readOnly
            error="required"
            data-testid="bad-input"
          />
        )}
      </div>
      <button type="submit">save</button>
    </form>
  );
}

describe("useScrollToFirstInvalid", () => {
  it("scrolls the first invalid input into view on a refused submit", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });

  it("focuses that input, without letting the browser scroll again", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(screen.getByTestId("bad-input")).toHaveFocus());
  });

  it("still reaches a control that has no input of its own to focus", async () => {
    // This is the case react-hook-form's own `shouldFocusError` cannot serve: the value was
    // written with `setValue`, so there is no registered ref anywhere.
    render(<Harness picker />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });

  it("does nothing when every control is valid", async () => {
    function Valid() {
      const { containerRef, scrollToFirstInvalid } =
        useScrollToFirstInvalid<HTMLDivElement>();
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            scrollToFirstInvalid();
          }}
        >
          <div ref={containerRef}>
            <FormInput label="only" value="ok" readOnly />
          </div>
          <button type="submit">save</button>
        </form>
      );
    }
    render(<Valid />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(scrollIntoView).not.toHaveBeenCalled());
  });
});
