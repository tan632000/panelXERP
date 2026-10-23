const { containsVietnamese } = require("../utils");

const VIETNAMESE_COMMENT_IGNORE_FILES =
  /(?:^|\/)api\/generated\/|(?:^|\/)database\/migrations\/|\.(spec|test)\.[tj]sx?$/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Vietnamese text in code comments (use English)",
    },
    schema: [],
    messages: {
      vietnameseComment:
        "Code comments must be English. Move user-facing Vietnamese copy to vi/en JSON.",
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    );
    const normalized = filename.includes("/src/")
      ? filename.slice(filename.indexOf("/src/") + "/src/".length)
      : filename;

    if (VIETNAMESE_COMMENT_IGNORE_FILES.test(normalized)) {
      return {};
    }

    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (!containsVietnamese(comment.value)) continue;
          context.report({
            loc: comment.loc,
            messageId: "vietnameseComment",
          });
        }
      },
    };
  },
};
