'use strict';

// Runs jest in two passes so specs that issue DDL (DROP INDEX, CREATE TABLE, ...)
// never overlap with specs that insert into the same database. Pass one runs every
// other spec in parallel; pass two runs the DDL specs one at a time.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const DDL_SPECS = [
  'src/plugins/sales/order/database/bom-item-link.migration.spec.ts',
  'src/plugins/sales/quotation/services/quotation-code.spec.ts',
  'src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts',
].map((spec) => path.join(backendRoot, spec));

// Options whose value may follow as its own argument; any other bare argument is a
// path pattern.
const VALUE_OPTIONS = new Set([
  '-t',
  '--testNamePattern',
  '-c',
  '--config',
  '-w',
  '--maxWorkers',
  '--shard',
  '--selectProjects',
  '--outputFile',
  '--testTimeout',
  '--reporters',
  '--testPathPatterns',
  '--testPathIgnorePatterns',
  '--changedSince',
  '--coverageDirectory',
  '--collectCoverageFrom',
  '--coverageReporters',
  '--rootDir',
  '--seed',
  '--testEnvironment',
  '--testMatch',
  '--testRegex',
  '--maxConcurrency',
]);

const flags = [];
const patterns = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith('-')) {
    patterns.push(arg);
  } else if (VALUE_OPTIONS.has(arg) && index + 1 < args.length) {
    flags.push(`${arg}=${args[index + 1]}`);
    index += 1;
  } else {
    flags.push(arg);
  }
}

// Two passes never finish under watch mode; it has its own script.
if (flags.some((flag) => /^--watch(All)?(=|$)/.test(flag))) {
  console.error('Watch mode runs one jest; use `npm run test:watch`.');
  process.exit(1);
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const jestBin = require.resolve('jest/bin/jest');
const runJest = (jestArgs, options = { stdio: 'inherit' }) => {
  const result = spawnSync(process.execPath, [jestBin, ...jestArgs], {
    cwd: backendRoot,
    ...options,
  });
  if (result.error || result.signal) {
    console.error(`jest did not finish: ${result.error ?? result.signal}`);
  }
  return result;
};

// jest itself decides which DDL specs the patterns select, so a narrowed run keeps
// exactly the ones jest would have run; with none selected the second pass is
// skipped (no patterns would make jest run everything).
// Output options would send the list to a file instead of stdout.
const listFlags = flags.filter(
  (flag) => !/^--(json|outputFile)(=|$)/.test(flag),
);
const listed = runJest([...patterns, ...listFlags, '--listTests', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
if (listed.status !== 0) process.exit(listed.status ?? 1);
let selectedPaths;
try {
  selectedPaths = new Set(JSON.parse(listed.stdout));
} catch {
  console.error(`jest --listTests did not print a list:\n${listed.stdout}`);
  process.exit(1);
}
const selected = DDL_SPECS.filter((spec) => selectedPaths.has(spec));

// One `=` value and the patterns first: jest's array options take the bare
// arguments after them, which would turn a path to run into one to ignore.
const ignoreDdl = `--testPathIgnorePatterns=(${DDL_SPECS.map(escapeRegex).join('|')})$`;
const first = runJest([
  ...patterns,
  ...flags,
  ignoreDdl,
  // A pattern naming only DDL specs leaves this pass empty; pass two runs them.
  ...(selected.length > 0 ? ['--passWithNoTests'] : []),
]);
const firstStatus = first.status ?? 1;

const secondStatus =
  selected.length === 0
    ? 0
    : (runJest([
        ...flags,
        '--runInBand',
        ...selected.map((spec) => `^${escapeRegex(spec)}$`),
      ]).status ?? 1);

process.exit(firstStatus || secondStatus);
