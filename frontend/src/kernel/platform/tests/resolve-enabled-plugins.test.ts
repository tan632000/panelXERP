import { describe, expect, it } from "vitest";

import {
  filterFrontendPluginsByKey,
  parseEnabledPluginKeys,
} from "@kernel/platform/plugins/resolve-enabled-plugins";

const catalog = [
  { key: "master-data", label: "md" },
  { key: "sales", label: "sl" },
] as const;

describe("parseEnabledPluginKeys", () => {
  it("returns fallback when env is empty", () => {
    expect(parseEnabledPluginKeys(undefined, ["master-data", "sales"])).toEqual(
      ["master-data", "sales"],
    );
  });

  it("parses comma-separated keys", () => {
    expect(parseEnabledPluginKeys("sales", ["master-data", "sales"])).toEqual([
      "sales",
    ]);
  });
});

describe("filterFrontendPluginsByKey", () => {
  it("keeps catalog order for enabled keys", () => {
    expect(
      filterFrontendPluginsByKey(catalog, ["master-data", "sales"]).map(
        (p) => p.key,
      ),
    ).toEqual(["master-data", "sales"]);
  });

  it("throws for unknown plugin key", () => {
    expect(() => filterFrontendPluginsByKey(catalog, ["warehouse"])).toThrow(
      /Unknown frontend plugin/,
    );
  });
});
