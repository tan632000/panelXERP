import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const require = createRequire(import.meta.url);
const configDir = dirname(fileURLToPath(import.meta.url));
const erpPluginPath = [
  join(configDir, "eslint-plugin-erp", "index.js"),
  join(configDir, "tools", "eslint-plugin-erp", "index.js"),
  join(configDir, "..", "tools", "eslint-plugin-erp", "index.js"),
].find((candidate) => existsSync(candidate));

if (!erpPluginPath) {
  throw new Error(
    "eslint-plugin-erp not found. Expected tools/eslint-plugin-erp under the package or repo root.",
  );
}

const erpPlugin = require(erpPluginPath);

const noReexportRules = [
  {
    selector: "ExportAllDeclaration",
    message:
      "Do not re-export (`export * from`). Import from the original module instead.",
  },
  {
    selector: "ExportNamedDeclaration[source]",
    message:
      "Do not re-export (`export { x } from`). Import from the original module instead.",
  },
  {
    selector: "ExportNamedDeclaration:not([source]):not([declaration])",
    message:
      "Do not re-export (`export { x }` / `export type { x }`). Import from the original module instead.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "**/eslint-plugin-erp/**",
  ]),
  {
    plugins: {
      erp: erpPlugin,
    },
    rules: {
      "erp/no-cross-plugin-import": ["error", { mode: "frontend" }],
      "erp/no-native-number-input": "error",
      "erp/no-permission-literal": "error",
      "erp/no-vietnamese-comments": "error",

      // --- Shared hygiene (keep equivalent with backend/eslint.config.mjs) ---
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: ["error", "multi-line"],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "object-shorthand": ["error", "always"],
      "prefer-template": "error",
      "no-useless-concat": "error",
      "no-throw-literal": "error",
      "no-debugger": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-nested-ternary": "warn",
      "prefer-arrow-callback": ["warn", { allowNamedFunctions: true }],
      "no-useless-return": "error",
      "no-else-return": ["warn", { allowElseIf: false }],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/consistent-type-definitions": ["warn", "interface"],
      "@typescript-eslint/no-empty-function": [
        "warn",
        { allow: ["arrowFunctions", "functions", "methods"] },
      ],

      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*", "../**", ".."],
              message:
                "Do not use parent-relative imports (../). Use path aliases: @/, @kernel/*, or @plugins/*.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...noReexportRules],

      // Prefer import/no-duplicates (works with type+value from same module)
      "import/no-duplicates": "error",

      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "sibling",
            "parent",
            "index",
            "object",
            "type",
          ],
          pathGroups: [
            {
              pattern: "@kernel/**",
              group: "internal",
              position: "before",
            },
            {
              pattern: "@/kernel/**",
              group: "internal",
              position: "before",
            },
            {
              pattern: "@/**",
              group: "internal",
              position: "before",
            },
            {
              pattern: "@plugins/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin", "type"],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          distinctGroup: true,
        },
      ],
    },
  },
  {
    files: ["**/index.ts", "**/index.tsx"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    files: [
      "**/seeds/**",
      "**/scripts/**",
      "**/*.{spec,test}.{ts,tsx}",
      "**/test/**",
    ],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
