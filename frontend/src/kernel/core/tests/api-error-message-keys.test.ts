import { readFileSync } from "node:fs";
import { join } from "node:path";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/**
 * Every rule in a module's error table names an i18n key, because the server phrases its
 * rejections in English for the log and a form must never show that text. A key that does not
 * exist in a locale would put the raw key on the input instead — the failure this suite is
 * here to catch, since nothing else exercises these tables against the message files.
 *
 * The namespace is taken from the `Keys resolve against \`x.y.validation\`` line each table
 * carries, so a table that moves module keeps being checked against the right file.
 */
const NAMESPACE_NOTE = /Keys resolve against `([\w.]+)`/;
const MATCHER_ROW = /\[\s*\[[^\]]*\]\s*,\s*"[^"]+"\s*,\s*"([^"]+)"\s*,?\s*\]/g;

function readLocale(namespace: string, locale: "vi" | "en"): unknown {
  const [file, ...path] = namespace.split(".");
  const json: unknown = JSON.parse(
    readFileSync(join(SRC, "kernel", "langs", locale, `${file}.json`), "utf8"),
  );
  return path.reduce<unknown>((node, segment) => {
    if (node && typeof node === "object") {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, json);
}

interface TableUnderTest {
  file: string;
  namespace: string;
  keys: string[];
}

function collectTables(): TableUnderTest[] {
  const files = fg.sync("src/plugins/**/*.ts", { cwd: process.cwd() });
  const tables: TableUnderTest[] = [];

  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    // Split on the note so each table is read against the namespace declared above it.
    const blocks = source.split(NAMESPACE_NOTE);
    for (let index = 1; index < blocks.length; index += 2) {
      const namespace = blocks[index];
      const body = blocks[index + 1] ?? "";
      // Stop at the end of the table literal, so the next one is not folded into this.
      const literal = body.slice(0, body.indexOf("] as const"));
      const keys = [...literal.matchAll(MATCHER_ROW)].map((m) => m[1]);
      if (keys.length > 0) tables.push({ file, namespace, keys });
    }
  }

  return tables;
}

describe("api error message keys", () => {
  const tables = collectTables();

  it("reaches the plugin sources the tables live in", () => {
    // Guards against a glob that silently found nothing; every table found is checked below.
    expect(
      fg.sync("src/plugins/**/*.ts", { cwd: process.cwd() }).length,
    ).toBeGreaterThan(0);
  });

  it.each(["vi", "en"] as const)(
    "resolves every matcher key in %s",
    (locale) => {
      const missing: string[] = [];

      for (const { file, namespace, keys } of tables) {
        const messages = readLocale(namespace, locale);
        for (const key of keys) {
          const value = (messages as Record<string, unknown> | undefined)?.[
            key
          ];
          if (typeof value !== "string" || value.trim() === "") {
            missing.push(`${file}: ${namespace}.${key}`);
          }
        }
      }

      expect(missing).toEqual([]);
    },
  );
});
