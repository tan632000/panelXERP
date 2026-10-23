import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HorizontalScrollArea } from "@/kernel/core/components/ui/HorizontalScrollArea";
import { LineAddButton } from "@/kernel/core/components/ui/LineTableShell";
import { ModalScopeContext } from "@/kernel/core/components/ui/modal-scope-context";

let intersect: (isIntersecting: boolean) => void = () => {};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = (isIntersecting) =>
          callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  // A table twice as wide as its scroller.
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1600);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderArea() {
  return render(
    <HorizontalScrollArea className="overflow-x-auto">
      <table>
        <tbody>
          <tr>
            <td>wide row</td>
          </tr>
        </tbody>
      </table>
    </HorizontalScrollArea>,
  );
}

describe("HorizontalScrollArea sticky bar (Feedback: horizontal bar only after scrolling to the last row)", () => {
  it("pins a proxy bar while the scroller's own bar is out of view", () => {
    renderArea();
    expect(screen.queryByTestId("sticky-horizontal-scrollbar")).toBeNull();

    act(() => intersect(false));
    expect(screen.getByTestId("sticky-horizontal-scrollbar")).toHaveClass(
      "sticky",
      "bottom-0",
    );

    act(() => intersect(true));
    expect(screen.queryByTestId("sticky-horizontal-scrollbar")).toBeNull();
  });

  it("scrolls the content together with the proxy bar", () => {
    const { container } = renderArea();
    act(() => intersect(false));

    const bar = screen.getByTestId("sticky-horizontal-scrollbar");
    bar.scrollLeft = 240;
    fireEvent.scroll(bar);

    const scroller = container.querySelector(
      ".overflow-x-auto:not([data-testid])",
    );
    expect((scroller as HTMLElement).scrollLeft).toBe(240);
  });
});

describe("HorizontalScrollArea inside a modal", () => {
  it("bounds the table in its own two-axis scroller with a pinned header", () => {
    const { container } = render(
      <ModalScopeContext.Provider value>
        <HorizontalScrollArea className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>head</th>
              </tr>
            </thead>
          </table>
        </HorizontalScrollArea>
      </ModalScopeContext.Provider>,
    );

    const scroller = container.querySelector("table")?.parentElement;
    expect(scroller).toHaveClass(
      "max-h-[60vh]",
      "overflow-y-auto",
      "[&>table>thead]:sticky",
    );
  });

  it("never floats the proxy bar over the modal rows", () => {
    render(
      <ModalScopeContext.Provider value>
        <HorizontalScrollArea className="overflow-x-auto">
          <table />
        </HorizontalScrollArea>
      </ModalScopeContext.Provider>,
    );

    act(() => intersect(false));
    expect(screen.queryByTestId("sticky-horizontal-scrollbar")).toBeNull();
  });

  it("keeps a height the scroller already sets", () => {
    const { container } = render(
      <ModalScopeContext.Provider value>
        <HorizontalScrollArea className="max-h-[320px] overflow-auto">
          <table />
        </HorizontalScrollArea>
      </ModalScopeContext.Provider>,
    );

    expect(container.querySelector("table")?.parentElement).not.toHaveClass(
      "max-h-[60vh]",
    );
  });

  // Feedback 2026-10-08: the quotation modal body scrolled sideways onto blank space.
  it("clips absolutely positioned content so it cannot widen the modal body", () => {
    const { container } = render(
      <ModalScopeContext.Provider value>
        <HorizontalScrollArea className="overflow-x-auto">
          <table />
        </HorizontalScrollArea>
      </ModalScopeContext.Provider>,
    );

    expect(container.querySelector("table")?.parentElement).toHaveClass(
      "relative",
    );
  });
});

describe("LineAddButton in a bounded modal table", () => {
  it("scrolls the table box to the line just added", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    const onAdd = vi.fn();

    const { container } = render(
      <ModalScopeContext.Provider value>
        <div>
          <HorizontalScrollArea className="overflow-x-auto">
            <table />
          </HorizontalScrollArea>
          <LineAddButton label="Thêm dòng" onClick={onAdd} />
        </div>
      </ModalScopeContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Thêm dòng" }));

    expect(onAdd).toHaveBeenCalledOnce();
    const scroller = container.querySelector<HTMLElement>("[data-scroll-area]");
    expect(scroller?.scrollTop).toBe(900);
  });

  it("keeps observing the first child after it is swapped", async () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(element: Element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const { rerender } = render(
      <HorizontalScrollArea className="overflow-x-auto">
        <p data-testid="loading">loading</p>
      </HorizontalScrollArea>,
    );
    rerender(
      <HorizontalScrollArea className="overflow-x-auto">
        <table data-testid="rows" />
      </HorizontalScrollArea>,
    );

    await waitFor(() => expect(observed).toContain(screen.getByTestId("rows")));
  });
});
