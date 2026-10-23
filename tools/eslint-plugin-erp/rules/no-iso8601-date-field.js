/**
 * `@IsISO8601()` accepts a full timestamp as well as a calendar date. Anything that later
 * parses the value as `YYYY-MM-DD` — the document validity rules, date-only DB columns —
 * then rejects it silently, persisting a row that contradicts itself. `@IsDateOnly()` shares
 * one definition of "a date" with those rules, so validation and domain cannot drift.
 */

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow @IsISO8601() on date fields; use @IsDateOnly() so validation matches the domain's date parser",
    },
    schema: [],
    messages: {
      isoDateField:
        "Use @IsDateOnly() from '@shared/validators/is-date-only.validator' instead of @IsISO8601(): @IsISO8601 also accepts a timestamp, which the YYYY-MM-DD rules then reject silently.",
    },
  },
  create(context) {
    return {
      Decorator(node) {
        const expression = node.expression;
        const callee =
          expression.type === "CallExpression"
            ? expression.callee
            : expression;
        if (callee.type === "Identifier" && callee.name === "IsISO8601") {
          context.report({ node, messageId: "isoDateField" });
        }
      },
    };
  },
};
