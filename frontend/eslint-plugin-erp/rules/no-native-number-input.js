/**
 * A browser number input cannot show grouping separators, and the customer requires every
 * quantity, price, discount and freight cost to read `1.234.567,89` while it is being typed.
 * `NumberInput` (directly, or through `FormInput type="number"`) is the one control that does
 * that, and the one place the input-method handling lives — a Vietnamese keyboard on Linux
 * rewrites the field from its own buffer on every keystroke, which a bare input mishandles.
 */
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow <input type="number">; use NumberInput or FormInput type="number"',
    },
    schema: [],
    messages: {
      nativeNumberInput:
        'Use <NumberInput> (or <FormInput type="number">) instead of <input type="number">, so the field groups thousands and survives an input method.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "input") {
          return;
        }
        const type = node.attributes.find(
          (attribute) =>
            attribute.type === "JSXAttribute" &&
            attribute.name.type === "JSXIdentifier" &&
            attribute.name.name === "type",
        );
        if (!type || !type.value) return;
        if (type.value.type !== "Literal" || type.value.value !== "number") {
          return;
        }
        context.report({ node: type, messageId: "nativeNumberInput" });
      },
    };
  },
};
