import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it as vitestIt } from "vitest";

import enPermission from "@/kernel/langs/en/permission.json";
import viPermission from "@/kernel/langs/vi/permission.json";

/** Walks up for the sibling backend package, so a frontend-only checkout skips instead. */
function findPluginsRoot(): string | null {
  let dir = __dirname;
  for (;;) {
    const candidate = join(dir, "backend", "src", "plugins");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const PLUGINS_ROOT = findPluginsRoot();

/**
 * Scopes the role matrix leaves out (`UNLISTED_PERMISSIONS` in roles.service.ts), so nothing
 * labels them. A feature task adds one here when it declares such a scope.
 */
const UNLISTED = new Set<string>([]);

function permissionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return permissionFiles(path);
    return /\.permissions\.ts$/.test(name) ? [path] : [];
  });
}

/** One `'resource:action' as const` declaration. */
const SCOPE_DECLARATION = /'([a-z_]+:[a-z_:]+)'\s+as const/g;

/**
 * The scopes each permission file declares, read once for the whole file: walking the backend
 * tree through a Windows bind mount takes seconds, so a test that walks it again outruns the
 * default timeout.
 */
const SCOPES_BY_FILE: ReadonlyArray<readonly [string, string[]]> = PLUGINS_ROOT
  ? permissionFiles(PLUGINS_ROOT).map((file) => [
      file,
      [...readFileSync(file, "utf8").matchAll(SCOPE_DECLARATION)].map(
        (match) => match[1],
      ),
    ])
  : [];

/** Every `'resource:action' as const` a plugin declares. */
function declaredScopes(): string[] {
  const scopes = SCOPES_BY_FILE.flatMap(([, declared]) => declared);
  return [...new Set(scopes)].filter((scope) => !UNLISTED.has(scope));
}

describe.each([
  ["vi", viPermission],
  ["en", enPermission],
])("permission labels (%s)", (_locale, labels) => {
  // Cross-package, so it only runs where the backend is checked out beside the frontend.
  const it = PLUGINS_ROOT ? vitestIt : vitestIt.skip;
  const scopes = declaredScopes();

  it("reads a scope out of every permission file the plugins hold", () => {
    // Guards against a matcher that silently reads nothing: each declaring file must yield a
    // scope, so the label checks below cover every plugin that declares any.
    const silent = SCOPES_BY_FILE.filter(
      ([, declared]) => declared.length === 0,
    ).map(([file]) => file);
    expect(silent).toEqual([]);
  });

  it("names every declared scope, by its own label or its action's", () => {
    const unlabelled = scopes.filter((scope) => {
      const action = scope.split(":").slice(1).join(":");
      return !(scope in labels.scopes) && !(action in labels.actions);
    });
    expect(unlabelled).toEqual([]);
  });

  it("names every resource", () => {
    const resources = new Set(scopes.map((scope) => scope.split(":")[0]));
    const unlabelled = [...resources].filter((r) => !(r in labels.resources));
    expect(unlabelled).toEqual([]);
  });
});
