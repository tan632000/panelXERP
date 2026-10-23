#!/usr/bin/env ts-node
/**
 * Frontend Feature Generator — scaffolds a complete frontend feature module
 * following the panelXERP kernel/extension architecture.
 *
 * Usage:
 *   npm run generate:feature -- --plugin sales --feature invoice
 *   npm run generate:feature -- --plugin master-data --feature warehouse --depends product
 *
 * Options:
 *   --plugin <name>     Plugin name (sales, master-data, or new plugin name)
 *   --feature <name>    Feature name (kebab-case, e.g. 'delivery-plan')
 *   --depends <deps>    Comma-separated feature keys this depends on (optional)
 *
 * Output:
 *   Creates src/plugins/{plugin}/{feature}/ with all boilerplate files
 *   Updates {plugin}.features.ts with new feature entry
 *   Prints instructions for i18n registration
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "plugins");

/* ─── Args parsing ─────────────────────────────────────────── */

const args = process.argv.slice(2);
const getArg = (key: string): string | undefined => {
  const idx = args.indexOf(`--${key}`);
  return idx >= 0 ? args[idx + 1] : undefined;
};

function requireArg(key: string): string {
  const value = getArg(key);
  if (!value) {
    console.error(`❌ --${key} is required`);
    console.error("   Usage: npm run generate:feature -- --plugin sales --feature invoice");
    process.exit(1);
  }
  return value;
}

const PLUGIN = requireArg("plugin");
const FEATURE = requireArg("feature");
const DEPENDS = getArg("depends");

const pluginDir = path.join(SRC, PLUGIN);
if (!fs.existsSync(pluginDir)) {
  console.error(`❌ Plugin directory not found: ${pluginDir}`);
  console.error("   Available plugins:");
  fs.readdirSync(SRC).forEach((d) => {
    if (fs.statSync(path.join(SRC, d)).isDirectory() && !d.startsWith("_")) {
      console.error(`   - ${d}`);
    }
  });
  process.exit(1);
}

const featureDir = path.join(pluginDir, FEATURE);
if (fs.existsSync(featureDir)) {
  console.error(`❌ Feature already exists: ${featureDir}`);
  process.exit(1);
}

/* ─── Helpers ─────────────────────────────────────────────── */

function capitalize(s: string): string {
  return s
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function kebabToPascal(s: string): string {
  return capitalize(s);
}

function kebabToCamel(s: string): string {
  const pascal = capitalize(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/* ─── File content templates ──────────────────────────────── */

function featureDefContent(): string {
  const camel = kebabToCamel(FEATURE);
  const dependsStr = DEPENDS ? `\n  dependsOn: ["${DEPENDS}"],` : "";

  return `import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const ${camel}Feature: ErpFrontendFeature = {
  key: "${FEATURE}",
  plugin: "${PLUGIN}",${dependsStr}
  sectionTitle: "section${capitalize(PLUGIN)}",
  items: [
    {
      featureKey: "${FEATURE}",
      href: "/${PLUGIN}/${FEATURE}",
      icon: "file-description",
      label: "${FEATURE}",
      key: "${FEATURE}",
      permissions: ["${FEATURE}:read", "${FEATURE}:*"],
    },
  ],
};
`;
}

function constantsContent(): string {
  const camel = kebabToCamel(FEATURE);

  return `export const ${camel}ApiRoutes = {
  list: "/${FEATURE}",
  detail: (id: string) => \`/${FEATURE}/\${id}\`,
} as const;

export const ${camel}QueryKeys = {
  all: () => ["${PLUGIN}", "${FEATURE}"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...${camel}QueryKeys.all(), "list", filters] as const,
  detail: (id: string) => [...${camel}QueryKeys.all(), id] as const,
};
`;
}

function typesContent(): string {
  const pascal = kebabToPascal(FEATURE);

  return `export interface ${pascal} {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}
`;
}

function schemaContent(): string {
  const pascal = kebabToPascal(FEATURE);

  return `import { z } from "zod";

export const create${pascal}Schema = z.object({
  code: z.string().min(1, "Code is required").max(30),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
});

export type Create${pascal}FormValues = z.infer<typeof create${pascal}Schema>;
`;
}

function hooksContent(): string {
  const pascal = kebabToPascal(FEATURE);
  const camel = kebabToCamel(FEATURE);

  return `"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import api from "@/kernel/core/api/api";
import { ${camel}ApiRoutes, ${camel}QueryKeys } from "../constants";
import type { Create${pascal}FormValues } from "../schemas/create-${FEATURE}.schema";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type { ${pascal} } from "../types";

export function use${pascal}List(page = 1, search?: string) {
  return useQuery({
    queryKey: ${camel}QueryKeys.list({ page, search }),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<${pascal}>>(
        ${camel}ApiRoutes.list,
        { params: { page, search } },
      );
      return data;
    },
  });
}

export function use${pascal}Detail(id: string) {
  return useQuery({
    queryKey: ${camel}QueryKeys.detail(id),
    queryFn: async () => {
      const { data } = await api.get<${pascal}>(${camel}ApiRoutes.detail(id));
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreate${pascal}() {
  const qc = useQueryClient();
  return useMutationFeedback({
    mutationFn: async (input: Create${pascal}FormValues) => {
      const { data } = await api.post<${pascal}>(${camel}ApiRoutes.list, input);
      return data;
    },
    successMessage: "Created successfully",
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ${camel}QueryKeys.all() });
    },
  });
}

export function useUpdate${pascal}(id: string) {
  const qc = useQueryClient();
  return useMutationFeedback({
    mutationFn: async (input: Partial<Create${pascal}FormValues>) => {
      const { data } = await api.put<${pascal}>(${camel}ApiRoutes.detail(id), input);
      return data;
    },
    successMessage: "Updated successfully",
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ${camel}QueryKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ${camel}QueryKeys.all() });
    },
  });
}

export function useDelete${pascal}() {
  const qc = useQueryClient();
  return useMutationFeedback({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<{ id: string }>(${camel}ApiRoutes.detail(id));
      return data;
    },
    successMessage: "Deleted successfully",
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ${camel}QueryKeys.all() });
    },
  });
}
`;
}

function mockContent(): string {
  const pascal = kebabToPascal(FEATURE);

  return `import type { ${pascal} } from "../types";

export const MOCK_${FEATURE.toUpperCase().replace(/-/g, "_")}S: ${pascal}[] = [
  {
    id: 1,
    code: "${FEATURE}-001",
    name: "${pascal} 1",
    description: "First ${FEATURE} entry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    code: "${FEATURE}-002",
    name: "${pascal} 2",
    description: "Second ${FEATURE} entry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
`;
}

function componentContent(): string {
  const pascal = kebabToPascal(FEATURE);
  const camel = kebabToCamel(FEATURE);

  return `"use client";

import { Button, Modal, Table } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import { ${camel}ApiRoutes } from "../constants";
import { use${pascal}List, useDelete${pascal} } from "../hooks/use${pascal}";
import type { ${pascal} } from "../types";

interface ${pascal}ModalProps {
  opened: boolean;
  onClose: () => void;
}

export function ${pascal}Modal({ opened, onClose }: ${pascal}ModalProps) {
  const t = useTranslations("${FEATURE}");
  const { data, isLoading } = use${pascal}List();
  const deleteMutation = useDelete${pascal}();
  const items = data?.data ?? [];

  return (
    <Modal opened={opened} onClose={onClose} title={t("title")} size="xl">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th>{t("code")}</Table.Th>
            <Table.Th>{t("name")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item: ${pascal}) => (
            <Table.Tr key={item.id}>
              <Table.Td>{item.id}</Table.Td>
              <Table.Td>{item.code}</Table.Td>
              <Table.Td>{item.name}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Modal>
  );
}
`;
}

/* ─── Write file ──────────────────────────────────────────── */

function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`   ✅ Created: ${path.relative(ROOT, filePath)}`);
}

/* ─── Main generator ──────────────────────────────────────── */

function generate(): void {
  const pascal = kebabToPascal(FEATURE);
  const camel = kebabToCamel(FEATURE);

  console.log(`\n📦 Generating frontend feature: ${PLUGIN}/${FEATURE}\n`);

  // Create directories
  const dirs = [
    path.join(featureDir, "schemas"),
    path.join(featureDir, "hooks"),
    path.join(featureDir, "mock"),
    path.join(featureDir, "components"),
  ];
  dirs.forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // Feature definition
  writeFile(path.join(featureDir, `${FEATURE}.feature.ts`), featureDefContent());

  // Constants
  writeFile(path.join(featureDir, "constants.ts"), constantsContent());

  // Types
  writeFile(path.join(featureDir, "types.ts"), typesContent());

  // Schema
  writeFile(path.join(featureDir, "schemas", `create-${FEATURE}.schema.ts`), schemaContent());

  // Hooks
  writeFile(path.join(featureDir, "hooks", `use${pascal}.ts`), hooksContent());

  // Mock
  writeFile(path.join(featureDir, "mock", `${FEATURE}.mock.ts`), mockContent());

  // Component
  writeFile(path.join(featureDir, "components", `${pascal}Modal.tsx`), componentContent());

  // ── Update plugin features aggregation ──────────────────────

  const featuresPath = path.join(pluginDir, `${PLUGIN}.features.ts`);
  if (fs.existsSync(featuresPath)) {
    const existingContent = fs.readFileSync(featuresPath, "utf-8");

    const importLine = `import { ${camel}Feature } from "./${FEATURE}/${FEATURE}.feature";`;

    // Insert import after last existing import
    const lastImportIndex = existingContent.lastIndexOf("import ");
    const afterLastImportLineEnd = existingContent.indexOf("\n", lastImportIndex);
    const beforeImports = existingContent.slice(0, afterLastImportLineEnd + 1);
    const afterImports = existingContent.slice(afterLastImportLineEnd + 1);
    const updatedWithImport = `${beforeImports}${importLine}\n${afterImports}`;

    // Insert into the array before closing bracket
    const arrayEndIndex = updatedWithImport.lastIndexOf("];");
    const updatedContent =
      `${updatedWithImport.slice(0, arrayEndIndex)}  ${camel}Feature,\n${updatedWithImport.slice(arrayEndIndex)}`;

    fs.writeFileSync(featuresPath, updatedContent, "utf-8");
    console.log(`   ✅ Updated: ${path.relative(ROOT, featuresPath)}`);
  }

  // ── Summary ─────────────────────────────────────────────────

  const pluginPascal = capitalize(PLUGIN);

  console.log(`\n✨ Feature ${PLUGIN}/${FEATURE} generated successfully!\n`);
  console.log("   Files created:");
  console.log(`   src/plugins/${PLUGIN}/${FEATURE}/`);
  console.log(`   ├── ${FEATURE}.feature.ts`);
  console.log(`   ├── constants.ts`);
  console.log(`   ├── types.ts`);
  console.log(`   ├── schemas/create-${FEATURE}.schema.ts`);
  console.log(`   ├── hooks/use${pascal}.ts`);
  console.log(`   ├── mock/${FEATURE}.mock.ts`);
  console.log(`   └── components/${pascal}Modal.tsx\n`);
  if (fs.existsSync(featuresPath)) {
    console.log(`   ✅ ${pluginPascal}.features.ts updated with new feature entry\n`);
  }
  console.log("   ⚠️  Remember to:");
  console.log(`   1. Add translations in src/kernel/langs/en/${FEATURE}.json`);
  console.log(`   2. Add translations in src/kernel/langs/vi/${FEATURE}.json`);
  console.log("   3. Register translations in src/kernel/langs/load-messages.ts");
  console.log("   4. Create page route in app/[locale] directory if needed");
  console.log("   5. Run TypeScript check: npm run typecheck");
  console.log("");
}

generate();
