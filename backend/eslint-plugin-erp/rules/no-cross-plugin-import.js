const {
  isCrossPluginImportExemptFile,
  isLegacyCrossFeatureImport,
  importPathMatchesAllowed,
  importPathMatchesBanned,
  parsePluginImport,
  parsePluginFilePath,
  sameTopLevelPlugin,
  srcRelativePath,
} = require("../utils");

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow cross-top-level-plugin @plugins imports of services/entities without gateway/shared surfaces",
    },
    schema: [
      {
        type: "object",
        properties: {
          mode: { enum: ["backend", "frontend"] },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      crossTopLevelBanned:
        "Cross-plugin import '{{importPath}}' from '{{ownerPlugin}}' is not allowed ({{reason}}). Use @plugins/*/_shared/gateways for cross-plugin access.",
      crossTopLevelDisallowed:
        "Cross-plugin import '{{importPath}}' from '{{ownerPlugin}}' is not allowed. Allowed paths include shared, components, constants, types, hooks, services (frontend), dto, enums, utils, permissions, *.feature.",
    },
  },
  create(context) {
    const mode = context.options[0]?.mode ?? "backend";
    const filename = context.filename ?? context.getFilename();
    const importerRelative = srcRelativePath(filename);
    const ownerFeature = parsePluginFilePath(filename);

    if (!importerRelative || !ownerFeature) {
      return {};
    }

    if (isCrossPluginImportExemptFile(importerRelative)) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        const importPath =
          node.source.type === "Literal" ? String(node.source.value) : null;
        if (!importPath) return;

        const targetFeature = parsePluginImport(importPath);
        if (!targetFeature || "shared" in targetFeature) return;

        // Features within the same top-level plugin (master-data/*, sales/*) may import each other.
        if (sameTopLevelPlugin(ownerFeature, targetFeature)) return;

        if (isLegacyCrossFeatureImport(importerRelative, importPath)) {
          return;
        }

        if (importPathMatchesBanned(importPath, mode)) {
          context.report({
            node: node.source,
            messageId: "crossTopLevelBanned",
            data: {
              importPath,
              ownerPlugin: ownerFeature.top,
              reason:
                mode === "backend"
                  ? "backend services/entities must not cross top-level plugins"
                  : "entities must not cross top-level plugins",
            },
          });
          return;
        }

        if (!importPathMatchesAllowed(importPath)) {
          context.report({
            node: node.source,
            messageId: "crossTopLevelDisallowed",
            data: {
              importPath,
              ownerPlugin: ownerFeature.top,
            },
          });
        }
      },
    };
  },
};
