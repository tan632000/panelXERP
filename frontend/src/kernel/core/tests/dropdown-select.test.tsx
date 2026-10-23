import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DropdownSelect } from "@/kernel/core/components/ui/DropdownSelect";
import viCommon from "@/kernel/langs/vi/common.json";

afterEach(cleanup);

const OPTIONS = [
  { value: "R_2026_0047", label: "R_2026_0047" },
  { value: "R_2026_0048", label: "R_2026_0048" },
];

function Combobox({
  allowCustomInput,
  initialValue = "",
}: {
  allowCustomInput: boolean;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <DropdownSelect
        value={value}
        onChange={setValue}
        options={OPTIONS}
        allowCustomInput={allowCustomInput}
        placeholder="RFQ No."
      />
      <output data-testid="committed">{value}</output>
    </NextIntlClientProvider>
  );
}

describe("DropdownSelect free text", () => {
  it("keeps a typed value that matches no option, in the form and on screen", () => {
    render(<Combobox allowCustomInput />);
    const input = screen.getByPlaceholderText("RFQ No.");

    // The field only opens the list; the text is typed into the list's search box.
    fireEvent.focus(input);
    const search = screen.getByPlaceholderText(viCommon.search);
    fireEvent.change(search, { target: { value: "LEGACY-2019-77" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByTestId("committed")).toHaveTextContent("LEGACY-2019-77");

    // Leaving the field must not discard it: there is no matching option to relabel it.
    fireEvent.blur(input);
    expect(screen.getByTestId("committed")).toHaveTextContent("LEGACY-2019-77");
    expect(input).toHaveValue("LEGACY-2019-77");
  });

  it("prefers the option label when the value is one of the options", () => {
    render(<Combobox allowCustomInput initialValue="R_2026_0048" />);
    // Picking from the open menu is not covered here: the menu is portalled and positioned
    // from measured rects, which jsdom reports as zero, so it never becomes visible.
    expect(screen.getByPlaceholderText("RFQ No.")).toHaveValue("R_2026_0048");
  });

  it("greys a disabled field instead of leaving it white", () => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <DropdownSelect
          value=""
          onChange={() => {}}
          options={OPTIONS}
          disabled
          placeholder="RFQ No."
        />
      </NextIntlClientProvider>,
    );
    const input = screen.getByPlaceholderText("RFQ No.");

    // A field that cannot be changed has to read as one, the way a read-only input does.
    expect(input.className).toContain("bg-surface-secondary");
    expect(input.className).not.toContain("bg-surface-primary");
    expect(input.className).toContain("cursor-not-allowed");
  });

  it("hides the clear icon until a real option is selected", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <DropdownSelect
          value=""
          onChange={() => {}}
          options={[{ value: "", label: "-- Chọn --" }, ...OPTIONS]}
          allowCustomInput={false}
          placeholder="-- Chọn --"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTitle("Xoá")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <DropdownSelect
          value="R_2026_0047"
          onChange={() => {}}
          options={[{ value: "", label: "-- Chọn --" }, ...OPTIONS]}
          allowCustomInput={false}
          placeholder="-- Chọn --"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTitle("Xoá")).toBeInTheDocument();
  });

  it("hides the filter clear icon when the value is the all/default option", () => {
    const filterOptions = [
      { value: "all", label: "Tất cả khách hàng" },
      { value: "c1", label: "Công ty A" },
    ];

    const { rerender } = render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <DropdownSelect
          value="all"
          onChange={() => {}}
          options={filterOptions}
          showFilterIcon
          allowClear
          clearValue="all"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTitle("Xoá")).not.toBeInTheDocument();
    expect(screen.getByText("Tất cả khách hàng")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <DropdownSelect
          value="c1"
          onChange={() => {}}
          options={filterOptions}
          showFilterIcon
          allowClear
          clearValue="all"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTitle("Xoá")).toBeInTheDocument();
    expect(screen.getByText("Công ty A")).toBeInTheDocument();
  });
});

describe("DropdownSelect highlight", () => {
  const FIELDS = [
    { value: "industrial", label: "Industrial" },
    { value: "wood", label: "Wood" },
    { value: "aviation", label: "Aviation" },
  ];

  function Picker({ initialValue = "wood", withPlaceholder = false }) {
    const [value, setValue] = useState(initialValue);
    const options = withPlaceholder
      ? [{ value: "", label: "Choose" }, ...FIELDS]
      : FIELDS;
    return (
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <DropdownSelect value={value} onChange={setValue} options={options} />
      </NextIntlClientProvider>
    );
  }

  // The highlight's full shade; the chosen option keeps its own lighter `bg-brand-50/60`.
  const shaded = () =>
    screen
      .getAllByRole("option")
      .filter((option) => /(^|\s)bg-brand-50(\s|$)/.test(option.className))
      .map((option) => option.textContent);

  it("opens with the chosen option highlighted and ignores a touch's mouseenter", () => {
    // jsdom has no layout, so the highlight's scroll-into-view is a no-op here.
    Element.prototype.scrollIntoView = () => {};
    render(<Picker />);
    fireEvent.focus(screen.getByDisplayValue("Wood"));
    expect(shaded()).toEqual(["Wood"]);

    // A tap on a touch screen fires a compatibility pointer enter; it must not shade a
    // second row next to the chosen one.
    const aviation = screen.getByRole("option", { name: "Aviation" });
    fireEvent.pointerEnter(aviation, { pointerType: "touch" });
    fireEvent.mouseEnter(aviation);
    expect(shaded()).toEqual(["Wood"]);

    fireEvent.pointerEnter(aviation, { pointerType: "mouse" });
    expect(shaded()).toEqual(["Aviation"]);
  });

  it("highlights the chosen option, not the one after it, when a form adds an empty placeholder", () => {
    Element.prototype.scrollIntoView = () => {};
    render(<Picker initialValue="industrial" withPlaceholder />);
    fireEvent.focus(screen.getByDisplayValue("Industrial"));
    expect(shaded()).toEqual(["Industrial"]);
  });
});
