const noCrossPluginImport = require("./rules/no-cross-plugin-import");
const noIso8601DateField = require("./rules/no-iso8601-date-field");
const noPermissionLiteral = require("./rules/no-permission-literal");
const noVietnameseComments = require("./rules/no-vietnamese-comments");

/** @type {import('eslint').ESLint.Plugin} */
module.exports = {
  meta: {
    name: "eslint-plugin-erp",
    version: "1.0.0",
  },
  rules: {
    "no-cross-plugin-import": noCrossPluginImport,
    "no-iso8601-date-field": noIso8601DateField,
    "no-permission-literal": noPermissionLiteral,
    "no-vietnamese-comments": noVietnameseComments,
  },
};
