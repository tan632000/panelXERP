import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertEnglishEnumValues,
  assertEnumMessagesPresent,
  assertNoLocalizedLabelsInConstants,
  findLocalizedEnumFieldViolations,
  flattenMessageKeys,
  isEnglishEnumValue,
} from "@/kernel/core/lib/i18n-enum-conformance";

const SRC_ROOT = join(process.cwd(), "src");

/** Legacy files scheduled for i18n migration — do not add new entries. */
const LEGACY_LOCALIZED_CONSTANT_FILES = new Set([
  "kernel/core/constants/unit-of-measure.ts",
]);

function collectPluginEnumSourceFiles(
  dir: string,
  acc: string[] = [],
): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === "generated" || entry === "langs") continue;
      collectPluginEnumSourceFiles(fullPath, acc);
      continue;
    }
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
    const rel = relative(SRC_ROOT, fullPath);
    if (!rel.startsWith("plugins/")) continue;
    if (rel.endsWith("/constants.ts") || rel.includes("/utils/")) {
      acc.push(rel);
    }
  }
  return acc;
}

describe("i18n enum conformance helpers", () => {
  it("accepts English camelCase and ISO codes", () => {
    expect(isEnglishEnumValue("screw")).toBe(true);
    expect(isEnglishEnumValue("VND")).toBe(true);
    expect(isEnglishEnumValue("EXW")).toBe(true);
    expect(isEnglishEnumValue("pcs")).toBe(true);
  });

  it("rejects Vietnamese stored enum values", () => {
    expect(isEnglishEnumValue("Vít")).toBe(false);
    expect(isEnglishEnumValue("Có")).toBe(false);
  });
});

/** A feature enum shaped the way the contract requires, standing in for a plugin's own. */
const FIXTURE_ITEMS = [
  { value: "enclosure", label: null },
  { value: "breaker", label: null },
] as const;
const viFixture = { group: { enclosure: "Vỏ tủ", breaker: "Aptomat" } };
const enFixture = { group: { enclosure: "Enclosure", breaker: "Breaker" } };

describe("enum contract helpers (value English, label i18n)", () => {
  it("accepts English stored values and refuses a Vietnamese one", () => {
    const values = FIXTURE_ITEMS.map((item) => item.value);
    expect(() =>
      assertEnglishEnumValues(values, "FIXTURE_ITEMS"),
    ).not.toThrow();
    expect(() => assertEnglishEnumValues(["Vỏ tủ"], "FIXTURE_ITEMS")).toThrow(
      'FIXTURE_ITEMS: enum value "Vỏ tủ" must be an English identifier or ISO code',
    );
  });

  it("maps every value to vi/en labels and names the missing locale", () => {
    const values = FIXTURE_ITEMS.map((item) => item.value);
    expect(() =>
      assertEnumMessagesPresent(
        values,
        viFixture.group,
        enFixture.group,
        "FIXTURE_ITEMS",
      ),
    ).not.toThrow();
    expect(() =>
      assertEnumMessagesPresent(
        values,
        viFixture.group,
        { enclosure: "Enclosure" },
        "FIXTURE_ITEMS",
      ),
    ).toThrow('FIXTURE_ITEMS: missing en message key for enum "breaker"');
  });

  it("refuses a Vietnamese label embedded in constants", () => {
    expect(() =>
      assertNoLocalizedLabelsInConstants(FIXTURE_ITEMS, "FIXTURE_ITEMS"),
    ).not.toThrow();
    expect(() =>
      assertNoLocalizedLabelsInConstants(
        [{ value: "breaker", label: "Aptomat chống giật" }],
        "FIXTURE_ITEMS",
      ),
    ).toThrow("belongs in vi/en JSON, not in constants");
  });

  it("flattens nested message keys with dotted paths", () => {
    expect(flattenMessageKeys(viFixture)).toEqual([
      "group.enclosure",
      "group.breaker",
    ]);
  });
});

describe("plugin constants/utils static scan (lint:i18n gate)", () => {
  it("has no Vietnamese enum label/value in plugin constants or utils", () => {
    const violations: string[] = [];

    for (const relPath of collectPluginEnumSourceFiles(
      join(SRC_ROOT, "plugins"),
    )) {
      if (LEGACY_LOCALIZED_CONSTANT_FILES.has(relPath)) continue;

      const source = readFileSync(join(SRC_ROOT, relPath), "utf8");
      const hits = findLocalizedEnumFieldViolations(source);
      for (const hit of hits) {
        violations.push(
          `${relPath}: ${hit.field} "${hit.text}" must use English value + vi/en JSON label`,
        );
      }
    }

    expect(violations).toEqual([]);
    // Reads every plugin constants/utils file: its time grows with the plugins and passes the
    // 5 s default on a loaded machine without anything being wrong.
  }, 20_000);
});
