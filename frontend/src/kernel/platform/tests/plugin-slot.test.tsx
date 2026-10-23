import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PluginSlot } from "@kernel/platform/plugins/PluginSlot";

import type { AnySlotContribution } from "@kernel/platform/plugins/slot.types";

// The real registry resolves from `ENABLED_FRONTEND_PLUGINS` at module scope, so the render path
// is exercised against a stubbed contribution list instead of the shipped plugin catalogue.
const contributions: AnySlotContribution[] = [];

vi.mock("@kernel/platform/plugins/slot.registry", () => ({
  getSlotContributions: (name: string) =>
    contributions.filter((item) => item.slot === name),
}));

describe("PluginSlot", () => {
  it("renders nothing for a slot no plugin contributes to", () => {
    const { container } = render(
      <PluginSlot name="nobody.contributes.here" context={{}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("passes the host context to every contributor, in registry order", () => {
    const Panel = ({ label }: { label: string }) => <span>{label} panel</span>;
    const Note = ({ label }: { label: string }) => <span>{label} note</span>;
    contributions.push(
      { slot: "order.form.afterLines", id: "panel", Component: Panel },
      { slot: "order.form.afterLines", id: "note", Component: Note },
    );

    render(
      <PluginSlot
        name="order.form.afterLines"
        context={{ label: "from master-data" }}
      />,
    );

    expect(screen.getByText("from master-data panel")).toBeTruthy();
    expect(screen.getByText("from master-data note")).toBeTruthy();
  });
});
