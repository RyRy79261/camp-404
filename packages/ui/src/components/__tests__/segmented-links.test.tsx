import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SegmentedLinks } from "../segmented-control";

// The link-shaped segment row. What matters is that it stays LINKS: the inbox
// filter is a URL, so each segment must navigate, and the current one has to be
// announced as the current page (a radio's aria-checked would be a lie here —
// nothing is being chosen, a page is being visited).

const OPTIONS = [
  { value: "all", label: "All", href: "/notifications" },
  {
    value: "unread",
    label: "Unread · 2",
    href: "/notifications?filter=unread",
  },
  {
    value: "announcements",
    label: "Announcements",
    href: "/notifications?filter=announcements",
  },
];

describe("SegmentedLinks", () => {
  it("renders every segment as a link to its own href", () => {
    render(
      <SegmentedLinks aria-label="Filter" options={OPTIONS} value="all" />,
    );
    expect(screen.getByRole("link", { name: "All" }).getAttribute("href")).toBe(
      "/notifications",
    );
    expect(
      screen.getByRole("link", { name: "Unread · 2" }).getAttribute("href"),
    ).toBe("/notifications?filter=unread");
    expect(
      screen.getByRole("link", { name: "Announcements" }).getAttribute("href"),
    ).toBe("/notifications?filter=announcements");
  });

  it("marks only the showing segment as the current page", () => {
    render(
      <SegmentedLinks aria-label="Filter" options={OPTIONS} value="unread" />,
    );
    expect(
      screen.getByRole("link", { name: "Unread · 2" }).getAttribute("aria-current"), // prettier-ignore
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "All" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("highlights nothing when no option matches", () => {
    const { container } = render(
      <SegmentedLinks aria-label="Filter" options={OPTIONS} value="nonsense" />,
    );
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(0);
  });

  it("is a labelled navigation region", () => {
    render(
      <SegmentedLinks
        aria-label="Filter notifications"
        options={OPTIONS}
        value="all"
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Filter notifications" }),
    ).toBeTruthy();
  });

  it("renders through the anchor it is given, so Next's Link can take over", () => {
    function FakeLink({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
    }) {
      return (
        <a href={href} data-next-link="" {...rest}>
          {children}
        </a>
      );
    }
    render(
      <SegmentedLinks
        aria-label="Filter"
        options={OPTIONS}
        value="all"
        linkAs={FakeLink}
      />,
    );
    expect(
      screen.getByRole("link", { name: "All" }).hasAttribute("data-next-link"),
    ).toBe(true);
  });
});
