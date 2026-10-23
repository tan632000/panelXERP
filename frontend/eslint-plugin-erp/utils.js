/** @typedef {{ top: string, feature: string } | { shared: true } | null} PluginFeatureRef */

const VIETNAMESE_CHAR_PATTERN =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Permission scope literal: `resource:action` with optional nested segments or wildcard. */
const PERMISSION_LITERAL_PATTERN =
  /^[a-z][a-z0-9_]*(:[a-z][a-z0-9_*]+)+$/;

const PLUGIN_IMPORT_PREFIX = "@plugins/";

/** Banned cross-feature import path segments (services / persistence). */
const BANNED_CROSS_FEATURE_SEGMENTS = ["/services/", "/entities/"];

/**
 * UI / contract surfaces allowed across feature boundaries (picker, types, etc.).
 */
const ALLOWED_CROSS_FEATURE_SEGMENTS = [
  "/components/",
  "/constants",
  "/types",
  "/hooks/",
  "/schemas/",
  "/dto/",
  "/enums/",
  "/utils/",
  "/permissions/",
  "/events/",
  "/shared/",
  "/contexts/",
];

/**
 * Importer paths (posix, relative to package src/) temporarily exempt from cross-feature bans.
 * Remove entries as gateway / module wiring replaces direct service/entity imports.
 */
const LEGACY_CROSS_FEATURE_IMPORTERS = new Set([]);

/**
 * Files fully exempt from the cross-plugin import rule.
 * @param {string} normalizedPath posix path relative to src/
 */
function isCrossPluginImportExemptFile(normalizedPath) {
  return (
    normalizedPath.endsWith(".module.ts") ||
    normalizedPath.endsWith(".features.ts") ||
    normalizedPath.endsWith("/plugin.ts") ||
    normalizedPath.includes("/seeds/") ||
    normalizedPath.includes("/database/migrations/") ||
    /\.(spec|test)\.[tj]sx?$/.test(normalizedPath)
  );
}

/**
 * @param {string} importPath module specifier
 * @returns {PluginFeatureRef}
 */
function parsePluginImport(importPath) {
  if (!importPath.startsWith(PLUGIN_IMPORT_PREFIX)) return null;
  const rest = importPath.slice(PLUGIN_IMPORT_PREFIX.length);
  const parts = rest.split("/");
  const top = parts[0];
  if (!top || !parts[1]) return null;
  if (parts[1] === "_shared") return { shared: true };
  if (!parts[2] || parts[1].includes(".")) {
    return { top, feature: "_root" };
  }
  return { top, feature: parts[1] };
}

/**
 * @param {string} filePath absolute or relative file path
 * @returns {PluginFeatureRef | null}
 */
function parsePluginFilePath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/src/plugins/";
  const idx = normalized.indexOf(marker);
  if (idx < 0) return null;
  const rest = normalized.slice(idx + marker.length);
  const parts = rest.split("/");
  const top = parts[0];
  if (!top) return null;
  if (parts.length === 1 || parts[1] === "_shared") {
    return parts[1] === "_shared" ? null : { top, feature: "_root" };
  }
  if (!parts[2] || parts[1].includes(".")) {
    return { top, feature: "_root" };
  }
  return { top, feature: parts[1] };
}

/**
 * @param {string} filePath
 * @returns {string | null} path relative to src/ using posix separators
 */
function srcRelativePath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/src/";
  const idx = normalized.indexOf(marker);
  if (idx < 0) return null;
  return normalized.slice(idx + marker.length);
}

function sameFeature(a, b) {
  return a.top === b.top && a.feature === b.feature;
}

function sameTopLevelPlugin(a, b) {
  return a.top === b.top;
}

function containsVietnamese(text) {
  return VIETNAMESE_CHAR_PATTERN.test(text);
}

function isPermissionLiteral(value) {
  return typeof value === "string" && PERMISSION_LITERAL_PATTERN.test(value);
}

/**
 * @param {string} importerSrcRelative
 * @param {string} importPath
 */
function isLegacyCrossFeatureImport(importerSrcRelative, importPath) {
  if (!LEGACY_CROSS_FEATURE_IMPORTERS.has(importerSrcRelative)) return false;
  const target = parsePluginImport(importPath);
  const owner = parsePluginFilePath(`src/${importerSrcRelative}`);
  if (!target || !owner || "shared" in target) return false;
  return !sameFeature(owner, target);
}

/**
 * @param {'backend' | 'frontend'} mode
 * @param {string} importPath
 */
function importPathMatchesBanned(importPath, mode) {
  if (importPath.includes("/entities/")) return true;
  if (mode === "backend" && importPath.includes("/services/")) return true;
  return false;
}

/**
 * @param {string} importPath
 */
function importPathMatchesAllowed(importPath) {
  return ALLOWED_CROSS_FEATURE_SEGMENTS.some((segment) => {
    if (segment === "/constants") {
      return (
        importPath.includes("/constants") ||
        importPath.endsWith(".feature") ||
        importPath.includes(".feature")
      );
    }
    return importPath.includes(segment);
  });
}

module.exports = {
  ALLOWED_CROSS_FEATURE_SEGMENTS,
  BANNED_CROSS_FEATURE_SEGMENTS,
  containsVietnamese,
  importPathMatchesAllowed,
  importPathMatchesBanned,
  isCrossPluginImportExemptFile,
  isLegacyCrossFeatureImport,
  isPermissionLiteral,
  parsePluginFilePath,
  parsePluginImport,
  sameFeature,
  sameTopLevelPlugin,
  srcRelativePath,
};
