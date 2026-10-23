import * as fs from "fs";
import * as path from "path";

import { describe, expect, it } from "vitest";

/**
 * Every `t("key")` a component reads must exist in both bundles.
 *
 * `next-intl` throws at render time for a missing key, so the screen that uses it crashes
 * rather than degrading — and only when the branch holding that call is reached, which is
 * how a mistyped action title survived until a role with that permission opened the list.
 */

const SRC_DIR = path.join(__dirname, "..", "..", "..");
const LANG_DIR = path.join(SRC_DIR, "kernel", "langs");
const LOCALES = ["vi", "en"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function readBundle(locale: string, namespace: string): unknown {
  const file = path.join(LANG_DIR, locale, `${namespace}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Walks `a.b.c` into a bundle; a namespace may nest its keys. */
function hasKey(bundle: unknown, key: string): boolean {
  let node: unknown = bundle;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return false;
    node = (node as Record<string, unknown>)[part];
    if (node === undefined) return false;
  }
  return true;
}

interface Usage {
  file: string;
  namespace: string;
  key: string;
}

/**
 * `t("key")` calls paired with the namespace their hook opened.
 *
 * Bound by variable name rather than by file, because a component commonly opens two — its
 * own namespace and `common` — and reading only single-hook files would skip exactly the
 * components that have the most calls.
 *
 * A name bound twice in one file is dropped: two components in the same file may each call
 * their own `t` over a different namespace, and without real scoping a call cannot be
 * attributed to one of them.
 */
function collectUsages(): Usage[] {
  const usages: Usage[] = [];

  for (const file of walk(path.join(SRC_DIR, "plugins"))) {
    const source = fs.readFileSync(file, "utf8");

    const namespaceOf = new Map<string, string>();
    const ambiguous = new Set<string>();
    for (const binding of source.matchAll(
      /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useTranslations\(\s*"([a-zA-Z.]+)"\s*\)/g,
    )) {
      const [, name, namespace] = binding;
      const seen = namespaceOf.get(name);
      if (seen !== undefined && seen !== namespace) ambiguous.add(name);
      namespaceOf.set(name, namespace);
    }
    if (namespaceOf.size === 0) continue;

    for (const call of source.matchAll(
      /\b([A-Za-z_$][\w$]*)\(\s*"([a-zA-Z0-9_.]+)"/g,
    )) {
      if (ambiguous.has(call[1])) continue;
      const namespace = namespaceOf.get(call[1]);
      if (!namespace) continue;

      const [root, ...rest] = namespace.split(".");
      const prefix = rest.length > 0 ? `${rest.join(".")}.` : "";
      usages.push({
        file: path.relative(SRC_DIR, file),
        namespace: root,
        key: `${prefix}${call[2]}`,
      });
    }
  }
  return usages;
}

describe("translation keys used by plugin components", () => {
  const usages = collectUsages();

  it("finds the calls to check", () => {
    expect(usages.length).toBeGreaterThan(100);
  });

  for (const locale of LOCALES) {
    it(`resolves every key in the ${locale} bundle`, () => {
      const bundles = new Map<string, unknown>();
      const missing: string[] = [];

      for (const usage of usages) {
        if (!bundles.has(usage.namespace)) {
          bundles.set(usage.namespace, readBundle(locale, usage.namespace));
        }
        const bundle = bundles.get(usage.namespace);
        // A namespace with no bundle of its own is composed elsewhere; not this test's call.
        if (bundle === undefined) continue;

        if (!hasKey(bundle, usage.key)) {
          missing.push(`${usage.file} — ${usage.namespace}.${usage.key}`);
        }
      }

      expect(missing.sort()).toEqual([]);
    });
  }
});
