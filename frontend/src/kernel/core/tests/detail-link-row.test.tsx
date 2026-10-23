import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DetailLinkRow } from "@/kernel/core/components/ui/DetailLinkRow";

afterEach(cleanup);

const LABELS = {
  label: "Link tài liệu",
  emptyLabel: "—",
  openLabel: "Mở link",
};

describe("DetailLinkRow", () => {
  it("shows the host a URL points at, keeping the full value as its title", () => {
    render(
      <DetailLinkRow {...LABELS} url="https://drive.google.com/a/b?c=1" />,
    );
    const host = screen.getByText("drive.google.com");
    expect(host).toBeInTheDocument();
    expect(host).toHaveAttribute("title", "https://drive.google.com/a/b?c=1");
  });

  it("drops a www prefix from the host", () => {
    render(<DetailLinkRow {...LABELS} url="https://www.example.com/x" />);
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("falls back to the raw value when it is not a URL", () => {
    render(<DetailLinkRow {...LABELS} url="not a url" />);
    expect(screen.getByText("not a url")).toBeInTheDocument();
  });

  it("opens the URL in a new tab without leaking the referrer", () => {
    render(<DetailLinkRow {...LABELS} url="https://drive.google.com/a" />);
    const anchor = screen.getByRole("link", { name: /Mở link/ });
    expect(anchor).toHaveAttribute("href", "https://drive.google.com/a");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("offers no action when no URL is stored", () => {
    render(<DetailLinkRow {...LABELS} url={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("treats a whitespace-only URL as unset", () => {
    render(<DetailLinkRow {...LABELS} url="   " />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
