#!/usr/bin/env node
/**
 * Replace permission string literals in RequirePermission, permission props, and PermissionGate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCAN_ROOTS = [
  path.join(REPO, "backend/src/plugins"),
  path.join(REPO, "backend/src/kernel"),
  path.join(REPO, "frontend/src/plugins"),
  path.join(REPO, "frontend/src/app"),
  path.join(REPO, "frontend/src/kernel"),
];

const PERMISSION_PATTERN = /^[a-z][a-z0-9_]*(:[a-z][a-z0-9_*]+)+$/;

function findFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.permissions\.ts$/.test(entry.name)) continue;
    if (/-permission\.keys\.ts$/.test(entry.name)) continue;
    if (/\.feature\.ts$/.test(entry.name)) continue;
    if (/route-permissions\.ts$/.test(entry.name)) continue;
    if (/future-navigation\.ts$/.test(entry.name)) continue;
    if (/\.(spec|test)\.tsx?$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

/** @type {Map<string, { constName: string, importPath: string }>} */
const scopeMap = new Map();

function registerConst(constName, scope, importPath) {
  if (!PERMISSION_PATTERN.test(scope)) return;
  if (!scopeMap.has(scope)) {
    scopeMap.set(scope, { constName, importPath });
  }
}

function loadPermissionModules(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadPermissionModules(full);
      continue;
    }

    const rel = full.split(`${path.sep}src${path.sep}`)[1]?.replace(/\\/g, "/");
    if (!rel) continue;

    if (entry.name.endsWith(".permissions.ts")) {
      const importPath = `@plugins/${rel.replace(/\.ts$/, "").replace(/^plugins\//, "")}`;
      const source = fs.readFileSync(full, "utf8");
      for (const m of source.matchAll(
        /export const ([A-Z_]+) = ['"]([^'"]+)['"] as const;/g,
      )) {
        registerConst(m[1], m[2], importPath);
      }
      continue;
    }

    if (entry.name.endsWith("-permission.keys.ts")) {
      const importPath = `@plugins/${rel.replace(/\.ts$/, "").replace(/^plugins\//, "")}`;
      const source = fs.readFileSync(full, "utf8");
      const objMatch = source.match(/export const (\w+) = \{([\s\S]*?)\} as const;/);
      if (!objMatch) continue;
      const objName = objMatch[1];
      for (const m of objMatch[2].matchAll(/(\w+):\s*"([^"]+)"/g)) {
        registerConst(`${objName}.${m[1]}`, m[2], importPath);
      }
    }
  }
}

for (const root of SCAN_ROOTS) {
  if (fs.existsSync(root)) loadPermissionModules(root);
}

function resolve(scope) {
  return scopeMap.get(scope) ?? null;
}

function replaceScopeLiteral(scope) {
  const hit = resolve(scope);
  if (!hit) return null;
  return hit.constName;
}

function ensureImport(source, importPath, symbols) {
  const names = [...new Set(symbols.map((s) => s.split(".")[0]))];
  const line = `import { ${names.join(", ")} } from "${importPath}";`;
  if (source.includes(`from "${importPath}"`)) {
    return source;
  }
  const imports = [...source.matchAll(/^import .+;$/gm)];
  if (imports.length === 0) return `${line}\n${source}`;
  const last = imports.at(-1);
  const insertAt = last.index + last[0].length + 1;
  return `${source.slice(0, insertAt)  }${line}\n${  source.slice(insertAt)}`;
}

function transform(source) {
  /** @type {Array<{ constName: string, importPath: string }>} */
  const used = [];

  const record = (scope) => {
    const constName = replaceScopeLiteral(scope);
    if (!constName) return scope;
    const hit = resolve(scope);
    if (hit) used.push(hit);
    return constName;
  };

  let next = source;

  next = next.replace(
    /@RequirePermission\(([^)]*)\)/g,
    (full, args) => {
      const replaced = args.replace(
        /(['"])([a-z][a-z0-9_]*(?::[a-z][a-z0-9_*]+)+)\1/g,
        (_m, _q, scope) => record(scope),
      );
      return `@RequirePermission(${replaced})`;
    },
  );

  next = next.replace(
    /permission:\s*(['"])([a-z][a-z0-9_]*(?::[a-z][a-z0-9_*]+)+)\1/g,
    (_full, _q, scope) => `permission: ${record(scope)}`,
  );

  next = next.replace(
    /permission=(['"])([a-z][a-z0-9_]*(?::[a-z][a-z0-9_*]+)+)\1/g,
    (_full, _q, scope) => `permission={${record(scope)}}`,
  );

  if (next === source) return source;

  let withImports = next;
  for (const hit of used) {
    withImports = ensureImport(withImports, hit.importPath, [hit.constName]);
  }
  return withImports;
}

let changed = 0;
for (const root of SCAN_ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of findFiles(root)) {
    const before = fs.readFileSync(file, "utf8");
    const after = transform(before);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed += 1;
      console.log(path.relative(REPO, file));
    }
  }
}

console.log(`\nUpdated ${changed} files.`);
