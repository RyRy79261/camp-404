import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next/link needs no router for static rendering; map it to a plain anchor.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { BlockingLayer } from "@camp404/os";
import { BlockingNotice, RunnerHeader } from "../questionnaire/blocking-chrome";
import { OutsideBlockingLayer } from "../questionnaire/outside-blocking-layer";

// A questionnaire that holds the app says so and offers only Sign out; an
// optional one says it is optional and can be left for later.
describe("RunnerHeader — required or optional", () => {
  it("holds the app for a blocking send: Required, the notice, Sign out", () => {
    render(
      <>
        <RunnerHeader title="Kitchen shift" blocking />
        <BlockingNotice />
      </>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Kitchen shift" }),
    ).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(
      screen.getByText(/can't use the rest of the app until this is finished/i),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Later" })).toBeNull();
  });

  it("does not claim an optional send locks the app", () => {
    render(<RunnerHeader title="Kitchen shift" blocking={false} />);
    expect(screen.getByText("Optional")).toBeTruthy();
    expect(screen.queryByText(/can't use the rest of the app/i)).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign out" })).toBeNull();
    // The escape goes back to the inbox, where the questionnaire stays listed.
    expect(
      screen.getByRole("link", { name: "Later" }).getAttribute("href"),
    ).toBe("/notifications");
  });
});

// On the 404 OS desktop a held member's runner and its completion page sit in
// the blocking layer, which draws Sign out under the form: the page's own
// Sign out goes, so there is exactly one. Bare, the page keeps its own.
describe("one Sign out, inside the blocking layer or bare", () => {
  const layerSignOut = <a href="/auth/sign-out?from=layer">Sign out</a>;

  it("the runner's header: the layer's Sign out only, inside the layer", () => {
    render(
      <BlockingLayer title="Required form" signOut={layerSignOut}>
        <RunnerHeader title="Tent check" blocking />
      </BlockingLayer>,
    );
    const links = screen.getAllByRole("link", { name: "Sign out" });
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/auth/sign-out?from=layer");
  });

  it("the completion page's Sign out (OutsideBlockingLayer): gone inside, kept bare", () => {
    const page = (
      <OutsideBlockingLayer>
        <a href="/auth/sign-out">Sign out</a>
      </OutsideBlockingLayer>
    );
    const bare = render(page);
    expect(screen.getAllByRole("link", { name: "Sign out" })).toHaveLength(1);
    bare.unmount();

    render(
      <BlockingLayer title="Required form" signOut={layerSignOut}>
        {page}
      </BlockingLayer>,
    );
    const links = screen.getAllByRole("link", { name: "Sign out" });
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/auth/sign-out?from=layer");
  });
});
