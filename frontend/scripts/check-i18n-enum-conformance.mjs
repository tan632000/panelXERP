#!/usr/bin/env node
/**
 * Lint gate: enum values English in code; labels in vi/en JSON only.
 * Invoked by `npm run lint:i18n` (also chained from `npm run lint`).
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "src/kernel/core/tests/i18n-enum-conformance.test.ts",
  ],
  { stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
