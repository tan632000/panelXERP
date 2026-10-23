import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PLUGINS_DIR = path.resolve(__dirname, "../../../plugins");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const pluginFiles = walk(PLUGINS_DIR)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => ({ file, source: readFileSync(file, "utf8") }));

/** Every plugin component's source, keyed by the `@plugins/...` path an import names it by. */
const sourceByImportPath = new Map(
  pluginFiles.map(({ file, source }) => [
    `@plugins/${path.relative(PLUGINS_DIR, file).replace(/\.tsx$/, "")}`,
    source,
  ]),
);

/**
 * The confirmation a component reaches, following one level of composition.
 *
 * A screen may keep its confirmation in a named component of its own — a delete that also
 * has to collect a reason is a dialog with an input in it, not a bare yes/no — so the check
 * accepts a rendered plugin component that is itself built on `ConfirmDialog`. It is the
 * dialog that must be reached, not the word that must be spelled; anything further away than
 * one rendered import still counts as not asking.
 */
function confirmationSource(source: string): string | undefined {
  if (source.includes("ConfirmDialog")) return source;

  for (const match of source.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*"(@plugins\/[^"]+)"/g,
  )) {
    const imported = sourceByImportPath.get(match[2]);
    if (!imported?.includes("ConfirmDialog")) continue;
    const rendered = match[1]
      .split(",")
      .map((name) => name.trim())
      .some((name) => name && source.includes(`<${name}`));
    if (rendered) return imported;
  }
  return undefined;
}

/** Components that run a delete mutation. Each must ask before deleting. */
const deletePages = pluginFiles
  .filter(({ source }) => /\bdelete\w*\.(mutate|mutateAsync)\(/i.test(source))
  .map(({ file, source }) => ({
    name: path.relative(PLUGINS_DIR, file),
    source,
    confirmation: confirmationSource(source),
  }));

describe("every delete asks before it acts", () => {
  it("reaches the plugin components it has to check", () => {
    // Guards against a walk that silently found nothing; each delete surface found is then
    // checked below.
    expect(pluginFiles.length).toBeGreaterThan(0);
  });

  it.each(deletePages.map((p) => [p.name, p.confirmation]))(
    "%s renders a confirmation dialog",
    (_name, confirmation) => {
      expect(confirmation).toBeDefined();
    },
  );

  it.each(deletePages.map((p) => [p.name, p.source]))(
    "%s runs the delete from the dialog's confirm handler",
    (_name, source) => {
      expect(source).toMatch(/onConfirm=\{/);
    },
  );

  it.each(deletePages.map((p) => [p.name, p.source]))(
    "%s disables the dialog while the delete is in flight",
    (_name, source) => {
      expect(source).toMatch(/pending=\{[^}]*isPending/);
    },
  );

  /**
   * The mutation itself is what must never run from a click. Opening the dialog from one is
   * the whole point — `deleteConfirmation.request(row)` only records which row was asked
   * about — so the check looks for the mutation call, not for any name containing "delete".
   */
  it("never calls a delete mutation straight from a click handler", () => {
    for (const { name, source } of deletePages) {
      expect(
        source,
        `${name} triggers a delete without confirmation`,
      ).not.toMatch(
        /on(?:Click|Delete)=\{\([^)]*\)\s*=>\s*\w*delete\w*\.mutate(?:Async)?\(/i,
      );
    }
  });
});
