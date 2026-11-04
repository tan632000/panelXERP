import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateInput } from "@/kernel/core/components/ui/DateInput";
import enCommon from "@/kernel/langs/en/common.json";

afterEach(cleanup);

const CALENDAR = ".date-filter-calendar";

function renderDateInput(value = "") {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common: enCommon }}>
      <DateInput value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  const input = screen.getByPlaceholderText("dd/mm/yyyy");
  const openIcon = screen.getByRole("button", { name: "Open calendar" });
  return { onChange, input, openIcon };
}

describe("DateInput keyboard and opening month", () => {
  it("closes the calendar when Tab leaves the field, without picking a date", () => {
    const { onChange, input, openIcon } = renderDateInput();

    fireEvent.click(openIcon);
    expect(document.querySelector(CALENDAR)).not.toBeNull();

    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(document.querySelector(CALENDAR)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the calendar open when Tab is pressed on a day", () => {
    const { openIcon } = renderDateInput("2026-03-10");

    fireEvent.click(openIcon);
    const day = document.querySelector(
      ".react-datepicker__day:not(.react-datepicker__day--outside-month)",
    );
    expect(day).not.toBeNull();

    fireEvent.keyDown(day as Element, { key: "Tab" });

    expect(document.querySelector(CALENDAR)).not.toBeNull();
  });

  it("opens on the month of a typed date instead of the selected one", () => {
    const { input, openIcon } = renderDateInput("2027-01-15");

    fireEvent.change(input, { target: { value: "05/12/2026" } });
    fireEvent.click(openIcon);

    expect(screen.getByLabelText("Month")).toHaveValue("11");
    expect(screen.getByLabelText("Year")).toHaveValue("2026");
  });
});
