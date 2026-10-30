import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { enMessages, viMessages } from "@/kernel/langs/load-messages";
import { appNavigationSections } from "@/kernel/platform/plugins/navigation.registry";

const LOCALE_ROOT = path.join(process.cwd(), "src/kernel/langs");

describe("app sidebar", () => {
  it("renders the business sections of the enabled plugins, crm first", () => {
    expect(appNavigationSections.map((section) => section.title)).toEqual([
      "sidebarCrm",
      "sidebarCatalog",
      "sidebarSales",
      "sidebarInventory",
    ]);
    expect(appNavigationSections[0].items.map((item) => item.href)).toEqual([
      "/crm/customers",
      "/crm/projects",
    ]);
  });

  it("tags every section with the namespace holding its labels", () => {
    for (const section of appNavigationSections) {
      expect(section.namespace).toBeTruthy();
    }
  });

  /**
   * The sidebar resolves a section title and an item label as
   * `${namespace}.${key}` — the module key, not the feature bundle. A label filed
   * under the feature namespace therefore renders as a MISSING_MESSAGE at runtime
   * while every type still checks out, so the bundles are asserted here instead.
   */
  it("resolves every section title and item label in both locales", () => {
    const locales = { vi: viMessages, en: enMessages } as const;

    for (const [locale, messages] of Object.entries(locales)) {
      for (const section of appNavigationSections) {
        const namespace = messages[section.namespace as keyof typeof messages];
        expect(
          namespace,
          `${locale}: no bundle for the "${section.namespace}" namespace`,
        ).toBeTruthy();

        const bundle = namespace as unknown as Record<string, unknown>;
        expect(
          bundle[section.title as string],
          `${locale}: ${section.namespace}.${section.title} is missing`,
        ).toBeTruthy();

        for (const item of section.items) {
          expect(
            bundle[item.label as string],
            `${locale}: ${section.namespace}.${item.label} is missing`,
          ).toBeTruthy();
        }
      }
    }
  });

  // A page with no link of its own still tells the reader which module they are in.
  it("lights a visible entry of its section on every page that has no link of its own", () => {
    for (const section of appNavigationSections) {
      const visible = section.items.filter((item) => !item.hidden);
      for (const page of section.items.filter((item) => item.hidden)) {
        expect(
          visible.filter((item) => item.activeMatch?.includes(page.href)),
          `${page.href} lights nothing in ${section.title}`,
        ).toHaveLength(1);
      }
    }
  });

  /**
   * Both locales ship the same set of bundles. A bundle present on one side only means
   * a screen renders in one language and falls back to its key in the other.
   *
   * The file name does not have to match the namespace it is registered under — the
   * master-data bundle is `masterData.json` registered as `master-data` — so the
   * namespace side of this is covered by the label-resolution case above.
   */
  it("ships the same set of locale bundles on both sides", () => {
    const list = (locale: string) =>
      fs
        .readdirSync(path.join(LOCALE_ROOT, locale))
        .filter((file) => file.endsWith(".json"))
        .sort();

    expect(list("vi")).toEqual(list("en"));
  });
});
