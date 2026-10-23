import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";

import { isBaseLinesChangedError } from "@/kernel/core/lib/base-lines-changed";

const conflict = (data: unknown, status = 409) =>
  new AxiosError("x", undefined, undefined, undefined, {
    data,
    status,
    statusText: "",
    headers: {},
    config: { headers: {} as never },
  });

describe("isBaseLinesChangedError", () => {
  it("recognises the stale-document 409 by its code", () => {
    expect(
      isBaseLinesChangedError(conflict({ code: "baseLinesChanged" })),
    ).toBe(true);
  });

  it("reads the code from the filter's nested error body", () => {
    expect(
      isBaseLinesChangedError(
        conflict({
          statusCode: 409,
          error: { message: "x", code: "baseLinesChanged" },
        }),
      ),
    ).toBe(true);
  });

  it("ignores other conflicts and other statuses", () => {
    expect(isBaseLinesChangedError(conflict({ message: "Code exists." }))).toBe(
      false,
    );
    expect(
      isBaseLinesChangedError(conflict({ code: "baseLinesChanged" }, 400)),
    ).toBe(false);
    expect(isBaseLinesChangedError(new Error("x"))).toBe(false);
  });
});
