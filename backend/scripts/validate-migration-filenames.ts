import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { collectMigrationFilenameViolations } from '@kernel/core/database/validate-migration-filenames.util';

const backendRoot = resolve(__dirname, '..');

function collectMigrationFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(fullPath);
        continue;
      }

      if (
        fullPath.includes(join('database', 'migrations')) &&
        fullPath.endsWith('.ts')
      ) {
        files.push(fullPath);
      }
    }
  }

  walk(join(rootDir, 'src'));
  return files.sort((a, b) => a.localeCompare(b));
}

function resolveTargets(argv: string[]): string[] {
  if (argv.length === 0) {
    return collectMigrationFiles(backendRoot);
  }

  return argv.map((filePath) =>
    resolve(process.cwd(), filePath.replace(/^backend\//, '')),
  );
}

function main(): void {
  const strict = process.argv.includes('--strict');
  const fileArgs = process.argv.slice(2).filter((arg) => arg !== '--strict');
  const targets = resolveTargets(fileArgs);
  const violations = collectMigrationFilenameViolations(targets, {
    allowLegacy: !strict,
  });

  if (violations.length === 0) {
    console.log(
      `Migration filename check passed (${targets.length} file${targets.length === 1 ? '' : 's'}).`,
    );
    return;
  }

  console.error('Migration filename check failed:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}
