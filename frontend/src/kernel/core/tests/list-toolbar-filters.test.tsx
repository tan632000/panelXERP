import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DropdownSelect } from "@/kernel/core/components/ui/DropdownSelect";
import { ListToolbar } from "@/kernel/core/components/ui/ListPageLayout";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";
import viCommon from "@/kernel/langs/vi/common.json";

const AXES = ["phân loại", "trạng thái", "khách hàng"];

function Filter({
  axis,
  initial,
}: Readonly<{ axis: string; initial: string }>) {
  const [value, setValue] = useState(initial);
  return (
    <DropdownSelect
      showFilterIcon
      value={value}
      onChange={setValue}
      options={[
        { value: "", label: `Tất cả ${axis}` },
        { value: "a", label: `${axis} A` },
      ]}
    />
  );
}

function Toolbar({
  count,
  initial = "",
}: Readonly<{ count: number; initial?: string }>) {
  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <ListToolbar>
        <SearchInput value="" onChangeValue={() => undefined} />
        {AXES.slice(0, count).map((axis) => (
          <Filter key={axis} axis={axis} initial={initial} />
        ))}
      </ListToolbar>
    </NextIntlClientProvider>
  );
}

function mockViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: desktop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("ListToolbar filters", () => {
  beforeEach(() => mockViewport(true));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("moves even one or two filters into the panel on a desktop", async () => {
    render(<Toolbar count={2} />);

    const toggle = await screen.findByRole("button", {
      name: viCommon.filters,
    });
    fireEvent.click(toggle);
    expect(screen.getByText("Phân loại")).toBeTruthy();
    expect(screen.getByText("Trạng thái")).toBeTruthy();
  });

  it("moves three filters into a panel behind the Filters button", async () => {
    render(<Toolbar count={3} />);

    const toggle = await screen.findByRole("button", {
      name: viCommon.filters,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Phân loại")).toBeTruthy();
  });

  it("opens even one filter as a bottom sheet on a phone", async () => {
    mockViewport(false);
    render(<Toolbar count={1} />);

    fireEvent.click(
      await screen.findByRole("button", { name: viCommon.filters }),
    );
    const sheet = screen.getByRole("dialog", { name: viCommon.filters });
    expect(sheet.textContent).toContain("Phân loại");

    fireEvent.click(screen.getByText(viCommon.showResults));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reads a bare 'All' under the caption instead of repeating the axis", async () => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <ListToolbar>
          <DropdownSelect
            showFilterIcon
            clearValue="all"
            value="all"
            onChange={() => undefined}
            options={[
              { value: "all", label: "Trạng thái: Tất cả" },
              { value: "a", label: "A" },
            ]}
          />
        </ListToolbar>
      </NextIntlClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: viCommon.filters }),
    );
    expect(screen.getByText("Trạng thái")).toBeTruthy();
    expect(screen.getByText(viCommon.allOption)).toBeTruthy();
    expect(screen.queryByText("Trạng thái: Tất cả")).toBeNull();
  });

  it("shows a chip per applied filter while the panel is closed, and clears it", async () => {
    render(<Toolbar count={3} initial="a" />);

    const chip = await screen.findByText("Phân loại: phân loại A");
    fireEvent.click(
      chip.parentElement?.querySelector("button") as HTMLButtonElement,
    );

    expect(screen.queryByText("Phân loại: phân loại A")).toBeNull();
    expect(screen.getByText("Trạng thái: trạng thái A")).toBeTruthy();
  });
});
