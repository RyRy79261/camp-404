import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Mail } from "lucide-react";

import { NavCard } from "../nav-card";

describe("NavCard", () => {
  it("renders an anchor with title, description, and href", () => {
    render(
      <NavCard
        href="/tools/invite"
        title="Invite a member"
        description="Mint a named invite link."
        icon={<Mail data-testid="icon" />}
      />,
    );
    const link = screen.getByRole("link", { name: /Invite a member/ });
    expect(link.getAttribute("href")).toBe("/tools/invite");
    expect(screen.getByText("Mint a named invite link.")).toBeTruthy();
  });

  it("frames the icon in a 46px rounded md IconBadge chip", () => {
    render(<NavCard href="/x" title="X" icon={<Mail data-testid="icon" />} />);
    const chip = screen.getByTestId("icon").parentElement;
    expect(chip).toBeTruthy();
    expect(chip?.className).toContain("h-[46px]"); // IconBadge size="md"
    expect(chip?.className).toContain("rounded-xl"); // rounded+md compound
  });

  it("omits the chip when no icon is given", () => {
    const { container } = render(<NavCard href="/x" title="No icon" />);
    expect(screen.getByText("No icon")).toBeTruthy();
    // With no icon chip, only the trailing chevron svg is present (no IconBadge).
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });
});
