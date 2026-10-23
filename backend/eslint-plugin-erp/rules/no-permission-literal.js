const { isPermissionLiteral } = require("../utils");

/** Files where permission scope strings are defined (source of truth). */
const PERMISSION_DEFINITION_FILE =
  /(?:^|\/)permissions\/[^/]+\.permissions\.ts$|(?:^|\/)permissions\/[^/]+-permission\.keys\.ts$|\.feature\.ts$|\/seed-roles\.ts$|route-permissions\.ts$|future-navigation\.ts$|generate-feature\.ts$/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hard-coded permission scope strings outside *.permissions.ts / *-permission.keys.ts",
    },
    schema: [],
    messages: {
      permissionLiteral:
        "Use permission constants from *.permissions.ts or *-permission.keys.ts instead of '{{value}}'.",
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    );

    if (isPermissionDefinitionFile(filename)) {
      return {};
    }

    if (/\.(spec|test)\.[tj]sx?$/.test(filename)) {
      return {};
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (!isPermissionLiteral(node.value)) return;
        if (!isPermissionUsage(node)) return;

        context.report({
          node,
          messageId: "permissionLiteral",
          data: { value: node.value },
        });
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (node.name.name !== "permission") return;
        if (
          !node.value ||
          node.value.type !== "Literal" ||
          typeof node.value.value !== "string"
        ) {
          return;
        }
        if (!isPermissionLiteral(node.value.value)) return;

        context.report({
          node: node.value,
          messageId: "permissionLiteral",
          data: { value: node.value.value },
        });
      },
    };
  },
};

function isPermissionDefinitionFile(filename) {
  const normalized = filename.includes("/src/")
    ? filename.slice(filename.indexOf("/src/") + "/src/".length)
    : filename;
  return PERMISSION_DEFINITION_FILE.test(normalized);
}

/**
 * @param {import('estree').Literal} node
 */
function isPermissionUsage(node) {
  const parent = node.parent;
  if (!parent) return false;

  if (parent.type === "JSXAttribute") {
    return parent.name.type === "JSXIdentifier" && parent.name.name === "permission";
  }

  if (parent.type === "Property" && parent.key.type === "Identifier") {
    if (parent.key.name === "permission") return true;
    if (parent.key.name === "permissions" && isPermissionsArrayProperty(parent)) {
      return true;
    }
  }

  if (parent.type === "CallExpression" && isRequirePermissionCallee(parent.callee)) {
    return true;
  }

  return false;
}

function isPermissionsArrayProperty(propertyNode) {
  const objectExpr = propertyNode.parent;
  if (!objectExpr || objectExpr.type !== "ObjectExpression") return false;
  const grand = objectExpr.parent;
  if (!grand) return false;
  if (grand.type === "Decorator") return true;
  return (
    grand.type === "CallExpression" &&
    grand.callee.type === "Identifier" &&
    grand.callee.name === "PermissionGate"
  );
}

function isRequirePermissionCallee(callee) {
  if (callee.type === "Identifier") {
    return callee.name === "RequirePermission";
  }
  return false;
}
