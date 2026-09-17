import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { BackButton } from "../back-button";

afterEach(cleanup);

describe("BackButton", () => {
  it("is a link named by where it goes", () => {
    render(<BackButton href="/" label="Back to home" />);
    const link = screen.getByRole("link", { name: "Back to home" });
    expect(link.getAttribute("href")).toBe("/");
    expect(link.className).toContain("h-10");
  });

  it("renders through the app's link component when given one", () => {
    const AppLink = React.forwardRef<
      HTMLAnchorElement,
      React.ComponentProps<"a">
    >((props, ref) => <a ref={ref} data-app-link="" {...props} />);
    render(<BackButton href="/tools" label="Back to tools" linkAs={AppLink} />);
    expect(
      screen
        .getByRole("link", { name: "Back to tools" })
        .hasAttribute("data-app-link"),
    ).toBe(true);
  });
});
