import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const testFiles = walk(SRC)
  .filter((file) => /\.test\.tsx?$/.test(file))
  .map((file) => path.relative(SRC, file));

/**
 * A feature owns its tests.
 *
 * Every test lives in the `tests/` folder of the kernel layer or plugin it covers, so a
 * plugin can be removed, moved or read on its own without leaving tests behind in a shared
 * directory — and so no plugin's tests depend on another plugin's internals.
 */
describe("test layout", () => {
  it("finds the suite", () => {
    expect(testFiles.length).toBeGreaterThan(20);
  });

  it.each(testFiles)("%s sits in a tests/ folder", (file) => {
    expect(path.dirname(file).split(path.sep)).toContain("tests");
  });

  it("keeps every plugin's tests inside that plugin", () => {
    const misplaced = testFiles.filter((file) => {
      const parts = file.split(path.sep);
      if (parts[0] !== "plugins") return false;
      // plugins/<group>/<module>/tests/...
      return parts[3] !== "tests";
    });
    expect(misplaced).toEqual([]);
  });

  it("leaves only shared infrastructure in the top-level test folder", () => {
    const shared = walk(path.join(SRC, "test")).map((file) =>
      path.relative(SRC, file),
    );
    expect(shared.some((file) => /\.test\.tsx?$/.test(file))).toBe(false);
  });
});
