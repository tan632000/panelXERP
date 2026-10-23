import * as fs from "fs";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  findNavigationItem,
  normalizeModulePath,
} from "@/kernel/core/permissions/route-permissions";

const APP_ROOT = path.resolve(__dirname, "../../../app/[locale]");

/** Administration screens stay administrator-only (`*:*`) by design. */
const ADMIN_ONLY_MODULES = new Set(["system"]);

/** Every `page.tsx` under the app root, as a concrete URL with `1` for each dynamic segment. */
function collectPages(dir: string, segments: string[], out: string[][]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      collectPages(path.join(dir, entry.name), [...segments, entry.name], out);
    } else if (entry.name === "page.tsx") {
      out.push(segments);
    }
  }
}

/** The `moduleKey` the nearest layout hands to `ModuleShell`, or null outside a module. */
function moduleKeyOf(segments: string[]): string | null {
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const layout = path.join(
      APP_ROOT,
      ...segments.slice(0, depth),
      "layout.tsx",
    );
    if (!fs.existsSync(layout)) continue;
    const match = /<ModuleShell[^>]*moduleKey="([^"]+)"/.exec(
      fs.readFileSync(layout, "utf8"),
    );
    if (match) return match[1];
  }
  return null;
}

function toUrl(segments: string[]): string {
  const parts = segments
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .filter((segment) => !segment.startsWith("[[..."))
    .map((segment) => (segment.startsWith("[") ? "1" : segment));
  return `/${parts.join("/")}`;
}

/**
 * `ModuleShell` admits a non-administrator only to a URL some navigation entry covers (hidden
 * entries count); any other page is a 403 for every role however its permissions are ticked.
 * So every module page must resolve to an entry, and that entry is what gates it.
 */
describe("route navigation coverage", () => {
  const pages: string[][] = [];
  collectPages(APP_ROOT, [], pages);

  it("resolves every module page to a navigation entry", () => {
    // A walk that found no page would pass vacuously.
    expect(pages.length).toBeGreaterThan(0);
    const uncovered = pages.flatMap((segments) => {
      const moduleKey = moduleKeyOf(segments);
      if (!moduleKey || ADMIN_ONLY_MODULES.has(moduleKey)) return [];
      const url = toUrl(segments);
      if (normalizeModulePath(url) === `/${moduleKey}`) return [];
      return findNavigationItem(moduleKey, url) ? [] : [url];
    });
    expect(uncovered).toEqual([]);
  });
});
