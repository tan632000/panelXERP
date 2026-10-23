import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import type { Type } from '@nestjs/common';

const requireExtension = createRequire(
  path.resolve(process.cwd(), 'package.json'),
);

type ExtensionModuleExport = Type<unknown> | { default?: Type<unknown> };

/**
 * Extension module loader.
 *
 * Scans `dist/_extensions/` for compiled extension modules and
 * loads them at boot time.
 *
 * IMPORTANT: Extensions MUST be compiled to JS before loading.
 * In dev mode, run `npm run build` or `npx tsc` to compile them.
 * The `.ts` source fallback is intentionally NOT supported because
 * `require()` cannot load TypeScript from a compiled Node process.
 *
 * Convention:
 *   src/_extensions/{name}/
 *     {name}.extension.ts   — source (compiled to dist/)
 *   dist/_extensions/{name}/
 *     {name}.extension.js   — compiled module (default export)
 *
 * Usage in app.module.ts:
 *   import { loadExtensionModules } from './kernel/platform/extensions/extension-loader';
 *   const extensionModules = loadExtensionModules();
 *
 *   @Module({
 *     imports: [
 *       ...extensionModules,
 *     ],
 *   })
 */
export function loadExtensionModules(): Array<Type<unknown>> {
  const extDir = path.resolve(process.cwd(), 'dist', '_extensions');

  if (!fs.existsSync(extDir)) {
    return [];
  }

  return scanExtensions(extDir);
}

function scanExtensions(extDir: string): Array<Type<unknown>> {
  const modules: Array<Type<unknown>> = [];

  for (const entry of fs.readdirSync(extDir)) {
    if (entry.startsWith('.')) continue;

    const fullPath = path.join(extDir, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    const moduleClass = tryLoadExtension(entry, fullPath);
    if (moduleClass) {
      modules.push(moduleClass);
    }
  }

  return modules;
}

function tryLoadExtension(name: string, dir: string): Type<unknown> | null {
  const filePath = path.join(dir, `${name}.extension.js`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const loaded = requireExtension(filePath) as ExtensionModuleExport;
    const moduleClass = typeof loaded === 'function' ? loaded : loaded.default;
    if (moduleClass && typeof moduleClass === 'function') {
      console.warn(`[ExtensionLoader] Loaded extension: ${name}`);
      return moduleClass;
    }
    console.warn(`[ExtensionLoader] Extension "${name}" has no default export`);
    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ExtensionLoader] Failed to load extension "${name}": ${message}`,
    );
    return null;
  }
}
