import * as fs from "fs";
import * as path from "path";

import { describe, expect, it } from "vitest";

/**
 * Holds one way of gating a control across every feature.
 *
 * A permission written as a literal in a component cannot be found by a rename, does not
 * type-check against the scopes the backend declares, and gives a reviewer nothing to
 * compare with the customer's function list. Every feature therefore mirrors its backend
 * scopes into its own `permissions/` folder and gates on the named export.
 *
 * Two forms are accepted, both in use: the `<feature>-permission.keys.ts` object preferred
 * for new work, and the `SCREAMING_CASE` consts in `<feature>.permissions.ts`. What is held
 * here is that neither is bypassed by a literal. See docs/permission-convention.md.
 */

const PLUGINS_DIR = path.join(__dirname, "..", "..", "..", "plugins");

/**
 * Anything shaped like `module:action`, which is what a permission scope looks like.
 *
 * The optional third segment admits digits because the qualifier that needs one is an ordered
 * approval step — `quotation:approve:step1`, `tooling_order:approve:step2`. The first two
 * segments stay digit-free: a module and an action are named, never numbered.
 */
const SCOPE_SHAPE = /^[a-z][a-z_]*:[a-z][a-z_]*(:[a-z][a-z_0-9]*)?$/;

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
    if (full.includes(`${path.sep}tests${path.sep}`)) continue;
    out.push(full);
  }
  return out;
}

const sourceFiles = walk(PLUGINS_DIR);

function relative(file: string): string {
  return path.relative(PLUGINS_DIR, file).split(path.sep).join("/");
}

describe("permission gating convention", () => {
  it("gates no control on a literal permission string", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      const literals = [
        ...source.matchAll(/\bcan\(\s*"([^"]+)"/g),
        ...source.matchAll(/\bpermission=\{?\s*"([^"]+)"/g),
      ];
      for (const match of literals) {
        if (!SCOPE_SHAPE.test(match[1])) continue;
        offenders.push(`${relative(file)} — "${match[1]}"`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("declares every gated scope in a feature permission keys file", () => {
    const keyFiles = sourceFiles.filter((file) =>
      file.endsWith("-permission.keys.ts"),
    );
    // Guards against a walk that silently found nothing; every keys file found is checked.
    expect(keyFiles.length).toBeGreaterThan(0);

    const malformed: string[] = [];
    for (const file of keyFiles) {
      const source = fs.readFileSync(file, "utf8");
      const values = [...source.matchAll(/^\s*\w+:\s*"([^"]+)",/gm)].map(
        (match) => match[1],
      );
      expect(values.length).toBeGreaterThan(0);

      for (const value of values) {
        if (!SCOPE_SHAPE.test(value)) {
          malformed.push(`${relative(file)} — "${value}"`);
        }
      }
    }

    expect(malformed).toEqual([]);
  });

  /**
   * `can` already resolves `module:*` and `*:action`, so spelling the wildcard out a second
   * time reads as if it did not, and invites the next author to copy the longer form.
   */
  it("leaves wildcard resolution to the permission helper", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      if (/can\([^)]*\)\s*\|\|\s*can\(\s*"[a-z_]+:\*"\s*\)/.test(source)) {
        offenders.push(relative(file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
