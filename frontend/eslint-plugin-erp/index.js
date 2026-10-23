const noCrossPluginImport = require("./rules/no-cross-plugin-import");
const noNativeNumberInput = require("./rules/no-native-number-input");
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
    "no-native-number-input": noNativeNumberInput,
    "no-permission-literal": noPermissionLiteral,
    "no-vietnamese-comments": noVietnameseComments,
  },
};
