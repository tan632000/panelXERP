import { fireEvent, screen, waitFor } from "@testing-library/react";

type ActionName = string | RegExp;

/**
 * A toolbar offering both import and export folds them into one "Excel" menu; one offering
 * just one of them keeps it as a plain button. These find the action either way, opening the
 * menu when it is folded there.
 */
export function queryExcelAction(name: ActionName): HTMLElement | null {
  const button = screen.queryByRole("button", { name });
  if (button) return button;
  const trigger = document.querySelector<HTMLButtonElement>(
    '[data-toolbar-actions] button[aria-haspopup="menu"]',
  );
  if (!trigger) return null;
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
  return screen.queryByRole("menuitem", { name });
}

export function getExcelAction(name: ActionName): HTMLElement {
  const action = queryExcelAction(name);
  if (!action) throw new Error(`No Excel toolbar action named ${String(name)}`);
  return action;
}

export function findExcelAction(name: ActionName): Promise<HTMLElement> {
  return waitFor(() => getExcelAction(name));
}
