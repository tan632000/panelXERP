import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { enMessages, viMessages } from "@kernel/langs/load-messages";

/**
 * Keys `useToastMutationFeedback` resolves for every namespace handed to it. A namespace
 * missing one only shows up when a mutation fails, which is exactly when a fallback key
 * string is least useful, so it is checked here instead.
 */
const REQUIRED_KEYS = ["systemError", "forbidden"];

const PLUGIN_ROOT = path.join(process.cwd(), "src/plugins");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every namespace a plugin passes to the toast feedback hook. */
function declaredNamespaces(): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(PLUGIN_ROOT)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/toastNamespace: "([^"]+)"/g)) {
      found.add(match[1]);
    }
    for (const match of source.matchAll(
      /useToastMutationFeedback\(\s*"([^"]+)"/g,
    )) {
      found.add(match[1]);
    }
    // A module that names its namespace once, as a constant, passes the constant around.
    for (const match of source.matchAll(/const TOAST_NAMESPACE = "([^"]+)"/g)) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

function resolve(
  messages: Record<string, unknown>,
  namespace: string,
): Record<string, unknown> | null {
  let current: unknown = messages;
  for (const part of namespace.split(".")) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "object" && current !== null
    ? (current as Record<string, unknown>)
    : null;
}

describe("toast namespaces", () => {
  const namespaces = declaredNamespaces();

  it("finds the toast namespaces the plugins declare", () => {
    // Guards against a walk that silently found nothing; every namespace found is checked below.
    expect(namespaces.length).toBeGreaterThan(0);
  });

  for (const [locale, messages] of [
    ["vi", viMessages],
    ["en", enMessages],
  ] as const) {
    it(`resolves every required key in ${locale}`, () => {
      const missing: string[] = [];

      for (const namespace of namespaces) {
        const scope = resolve(
          messages as unknown as Record<string, unknown>,
          namespace,
        );
        if (!scope) {
          missing.push(`${namespace} (namespace absent)`);
          continue;
        }
        for (const key of REQUIRED_KEYS) {
          if (!(key in scope)) missing.push(`${namespace}.${key}`);
        }
      }

      expect(missing).toEqual([]);
    });
  }
});
