/** Matches TypeORM migration filenames: `{epochMs}-{kebab-slug}.ts`. */
export const MIGRATION_FILENAME_PATTERN = /^(\d{13})-[a-z0-9-]+\.ts$/;

/** Already-merged migrations kept to avoid blocking legacy history. */
export const LEGACY_PADDED_MIGRATION_FILENAMES = new Set([
  '1784035200000-update-material-schema.ts',
  '1787040000000-init-other-material.ts',
  '1787050000000-add-mold-doc-folder-link.ts',
]);

export function validateMigrationFilename(
  filePath: string,
  options: { allowLegacy?: boolean } = {},
): string | null {
  const filename = filePath.replace(/^.*[/\\]/, '');

  if (
    options.allowLegacy !== false &&
    LEGACY_PADDED_MIGRATION_FILENAMES.has(filename)
  ) {
    return null;
  }

  const match = MIGRATION_FILENAME_PATTERN.exec(filename);
  if (!match) {
    return [
      `Invalid migration filename "${filename}".`,
      'Expected: {13-digit-epoch-ms}-{kebab-name}.ts',
      'Example: 1787039703824-init-product-sfg-document-sequence.ts',
      'Generate prefix with: node -e "console.log(Date.now())"',
    ].join(' ');
  }

  const [, timestamp] = match;
  if (timestamp.endsWith('00000')) {
    return [
      `Migration timestamp "${timestamp}" in "${filename}" looks padded (ends with 00000).`,
      'Use a real epoch millisecond value from Date.now(), not a rounded placeholder.',
    ].join(' ');
  }

  return null;
}

export function collectMigrationFilenameViolations(
  filePaths: string[],
  options: { allowLegacy?: boolean } = {},
): string[] {
  const violations: string[] = [];

  for (const filePath of filePaths) {
    const message = validateMigrationFilename(filePath, options);
    if (message) {
      violations.push(message);
    }
  }

  return violations;
}
