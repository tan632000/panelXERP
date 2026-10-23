#!/usr/bin/env node
/**
 * Ensures controller files import every permission constant they reference.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTROLLERS = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".controller.ts")) CONTROLLERS.push(full);
  }
}

walk(path.join(REPO, "backend/src"));

function permissionsImportPath(controllerPath, source) {
  const pluginMatch = controllerPath.match(/plugins\/([^/]+)\/([^/]+)\//);
  if (!pluginMatch) {
    if (source.includes("RFQ_")) {
      return "@plugins/sales/rfq/permissions/rfq.permissions";
    }
    return null;
  }
  const [, top, feature] = pluginMatch;
  if (source.includes("SALES_ORDER_")) {
    return "@plugins/sales/order/permissions/order.permissions";
  }
  if (source.includes("REPORT_")) {
    return "@plugins/sales/reports/permissions/reports.permissions";
  }
  if (source.includes("PRODUCT_")) {
    return "@plugins/master-data/product/permissions/product.permissions";
  }
  const kebab = feature.replace(/_/g, "-");
  return `@plugins/${top}/${kebab}/permissions/${kebab}.permissions`.replace(
    /production-process/,
    "production-process",
  );
}

function resolvePermissionsFile(controllerPath, constants) {
  const pluginMatch = controllerPath.match(
    /plugins\/([^/]+)\/([^/]+)\//,
  );
  if (pluginMatch) {
    const [, top, feature] = pluginMatch;
    const permDir = path.join(
      REPO,
      "backend/src/plugins",
      top,
      feature,
      "permissions",
    );
    if (fs.existsSync(permDir)) {
      const permFile = fs
        .readdirSync(permDir)
        .find((f) => f.endsWith(".permissions.ts"));
      if (permFile) {
        return `@plugins/${top}/${feature}/permissions/${permFile.replace(/\.ts$/, "")}`;
      }
    }
  }
  if (constants.some((c) => c.startsWith("RFQ_"))) {
    return "@plugins/sales/rfq/permissions/rfq.permissions";
  }
  if (constants.some((c) => c.startsWith("PRODUCT_"))) {
    return "@plugins/master-data/product/permissions/product.permissions";
  }
  return null;
}

for (const file of CONTROLLERS) {
  let source = fs.readFileSync(file, "utf8");
  const used = [
    ...new Set(
      [...source.matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)]
        .map((m) => m[1])
        .filter((name) => {
          if (!name.includes("_")) return false;
          if (name.endsWith("_DTO") || name.endsWith("_KEY")) return false;
          if (
            [
              "API",
              "ASC",
              "DESC",
              "GET",
              "POST",
              "PATCH",
              "DELETE",
              "BODY",
              "JSON",
              "URL",
            ].includes(name)
          ) {
            return false;
          }
          return /^(PRODUCT|MOLD|MATERIAL|COMPANY|SUPPLIER|RFQ|QUOTATION|SALES_ORDER|REPORT|TOOL|COMMERCIAL|SURFACE|OTHER|PRODUCTION|DELIVERY|SAMPLE|TOOLING|OTHER_MATERIAL|SURFACE_TREATMENT|COMMERCIAL_GOODS|TOOL_EQUIPMENT|SURFACE_TREATMENT_MATERIAL|PRODUCTION_STAGE)/.test(
            name,
          );
        }),
    ),
  ];

  const permissionLike = used.filter(
    (name) =>
      source.includes(`RequirePermission(${name}`) ||
      source.includes(`permission: ${name}`) ||
      source.includes(`@RequirePermission(${name}`),
  );

  if (permissionLike.length === 0) continue;

  const importPath = resolvePermissionsFile(file, permissionLike);
  if (!importPath) continue;

  const importRegex = new RegExp(
    `import \\{([^}]+)\\} from ['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"];`,
  );
  const existing = source.match(importRegex);

  if (existing) {
    const current = existing[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = [...new Set([...current, ...permissionLike])].sort();
    if (merged.join(",") === current.sort().join(",")) continue;
    source = source.replace(
      importRegex,
      `import { ${merged.join(", ")} } from '${importPath}';`,
    );
  } else {
    const line = `import { ${permissionLike.sort().join(", ")} } from '${importPath}';\n`;
    const lastImport = [...source.matchAll(/^import .+;$/gm)].at(-1);
    if (lastImport) {
      const at = lastImport.index + lastImport[0].length + 1;
      source = source.slice(0, at) + line + source.slice(at);
    } else {
      source = line + source;
    }
  }

  fs.writeFileSync(file, source, "utf8");
  console.log(path.relative(REPO, file), "->", permissionLike.join(", "));
}
