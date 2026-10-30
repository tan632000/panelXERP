import { describe, expect, it } from "vitest";

import { cn } from "@/kernel/core/lib/cn";

describe("cn", () => {
  it("lets a caller's class replace the component's own class of the same kind", () => {
    expect(cn("w-full px-3", "w-28")).toBe("px-3 w-28");
    expect(
      cn("bg-surface-primary text-sm", false, "bg-surface-secondary"),
    ).toBe("text-sm bg-surface-secondary");
  });

  it("keeps a theme colour and a font size apart", () => {
    expect(cn("text-sm text-text-primary", "text-text-secondary")).toBe(
      "text-sm text-text-secondary",
    );
  });
});
