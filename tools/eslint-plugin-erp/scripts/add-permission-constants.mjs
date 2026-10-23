#!/usr/bin/env node
/**
 * Adds SCREAMING_SNAKE exports for each permission scope in *.permissions.ts files
 * that only declare string arrays today.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../backend/src");

function toConstName(scope) {
  return scope.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function findPermissionFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findPermissionFiles(full));
      continue;
    }
    if (entry.name.endsWith(".permissions.ts")) out.push(full);
  }
  return out;
}

for (const file of findPermissionFiles(path.join(ROOT, "plugins"))) {
  const source = fs.readFileSync(file, "utf8");
  if (/export const [A-Z_]+ = ['"]/.test(source)) continue;

  const match = source.match(
    /export const (\w+) = \[\s*([\s\S]*?)\s*\] as const;/,
  );
  if (!match) {
    console.warn(`skip (no array export): ${file}`);
    continue;
  }

  const exportName = match[1];
  const scopes = [...match[2].matchAll(/'([^']+)'|"([^"]+)"/g)].map(
    (m) => m[1] ?? m[2],
  );
  if (scopes.length === 0) continue;

  const constants = scopes
    .map((scope) => `export const ${toConstName(scope)} = '${scope}' as const;`)
    .join("\n");

  const arrayRefs = scopes.map((scope) => toConstName(scope)).join(", ");
  const next = `${constants}\n\nexport const ${exportName} = [${arrayRefs}] as const;\n`;

  fs.writeFileSync(file, next, "utf8");
  console.log(`updated ${path.relative(ROOT, file)} (${scopes.length} scopes)`);
}
