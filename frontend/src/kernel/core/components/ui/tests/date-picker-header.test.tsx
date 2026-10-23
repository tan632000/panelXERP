import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatePickerHeader } from "@/kernel/core/components/ui/DatePickerHeader";

import type { ReactDatePickerCustomHeaderProps } from "react-datepicker";

afterEach(cleanup);

function renderHeader(
  overrides: Partial<ReactDatePickerCustomHeaderProps> = {},
) {
  const changeYear = vi.fn();
  const changeMonth = vi.fn();
  const decreaseYear = vi.fn();
  const increaseYear = vi.fn();
  const decreaseMonth = vi.fn();
  const increaseMonth = vi.fn();

  render(
    <DatePickerHeader
      date={new Date(2026, 2, 15)}
      monthDate={new Date(2026, 2, 1)}
      changeYear={changeYear}
      changeMonth={changeMonth}
      decreaseYear={decreaseYear}
      increaseYear={increaseYear}
      decreaseMonth={decreaseMonth}
      increaseMonth={increaseMonth}
      prevMonthButtonDisabled={false}
      nextMonthButtonDisabled={false}
      prevYearButtonDisabled={false}
      nextYearButtonDisabled={false}
      customHeaderCount={0}
      {...overrides}
    />,
  );

  return {
    changeYear,
    changeMonth,
    decreaseYear,
    increaseYear,
    decreaseMonth,
    increaseMonth,
  };
}

describe("DatePickerHeader year navigation", () => {
  it("offers a year select and year step buttons", () => {
    renderHeader();

    expect(screen.getByLabelText("Year")).toHaveValue("2026");
    expect(screen.getByLabelText("Previous year")).toBeInTheDocument();
    expect(screen.getByLabelText("Next year")).toBeInTheDocument();
  });

  it("jumps to the chosen year", () => {
    const { changeYear } = renderHeader();

    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2020" },
    });

    expect(changeYear).toHaveBeenCalledWith(2020);
  });

  it("steps a full year with the year chevrons", () => {
    const { decreaseYear, increaseYear } = renderHeader();

    fireEvent.click(screen.getByLabelText("Previous year"));
    fireEvent.click(screen.getByLabelText("Next year"));

    expect(decreaseYear).toHaveBeenCalledTimes(1);
    expect(increaseYear).toHaveBeenCalledTimes(1);
  });

  it("still steps one month with the month chevrons", () => {
    const { decreaseMonth, increaseMonth } = renderHeader();

    fireEvent.click(screen.getByLabelText("Previous month"));
    fireEvent.click(screen.getByLabelText("Next month"));

    expect(decreaseMonth).toHaveBeenCalledTimes(1);
    expect(increaseMonth).toHaveBeenCalledTimes(1);
  });
});
