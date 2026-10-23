import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import {
  type ClassificationItem,
  useClassificationOptions,
} from "@/kernel/core/hooks/useClassificationOptions";

afterEach(cleanup);

/** A feature classification enum with its labels, standing in for a plugin's own. */
type FixtureGroup = "enclosure" | "breaker" | "terminal" | "other";

const ITEMS: ReadonlyArray<ClassificationItem<FixtureGroup>> = [
  { value: "enclosure" },
  { value: "breaker" },
  { value: "terminal" },
  { value: "other" },
];
const BY_VALUE = Object.fromEntries(
  ITEMS.map((item) => [item.value, item]),
) as Record<FixtureGroup, ClassificationItem<FixtureGroup>>;

const viFixtureGroup = {
  enclosure: "Vỏ tủ điện",
  breaker: "Aptomat",
  terminal: "Cầu đấu dây",
  other: "Khác (tủ phụ)",
};

function Probe({ keyword }: { keyword: string }) {
  const { matchValues } = useClassificationOptions(
    "fixture.group",
    ITEMS,
    BY_VALUE,
  );
  return (
    <output data-testid="matched">{matchValues(keyword).join(",")}</output>
  );
}

function matched(keyword: string) {
  render(
    <NextIntlClientProvider
      locale="vi"
      messages={{ fixture: { group: viFixtureGroup } }}
    >
      <Probe keyword={keyword} />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId("matched").textContent;
}

describe("classification keyword matching", () => {
  // A classification column stores an English enum while the table shows the translated label,
  // so a picker search for the label can only reach its rows through this mapping.
  it("resolves a translated label to its enum value", () => {
    expect(matched("aptomat")).toBe("breaker");
  });

  it("ignores accents and case, the way a typed keyword usually arrives", () => {
    expect(matched("VO TU DIEN")).toBe("enclosure");
  });

  it("folds đ to d", () => {
    expect(matched("cau dau")).toBe("terminal");
  });

  it("matches on a partial label", () => {
    expect(matched("đấu")).toBe("terminal");
  });

  it("still matches the stored enum value itself", () => {
    expect(matched("terminal")).toBe("terminal");
  });

  it("returns every value a broad keyword hits", () => {
    // "tủ" appears in two labels; the caller sends both, so a keyword is never silently
    // narrowed to one classification.
    expect(matched("tủ")?.split(",")).toEqual(["enclosure", "other"]);
  });

  it("matches nothing for a keyword that is not a classification", () => {
    expect(matched("VT_0001")).toBe("");
  });
});
