import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReferralUser } from "@camp404/types";
import { FamilyTree } from "./family-tree";

// The family tree island: a disclosure per branch, a labelled search, and a
// highlight on the people a search found (not on the path to them).

afterEach(cleanup);

function person(
  id: string,
  inviterId: string | null,
  displayName: string,
): ReferralUser {
  return {
    id,
    inviterId,
    displayName,
    inviteCode: inviterId ? `code-${id}` : null,
    rank: "member",
  };
}

const roster = [
  person("a", null, "Marlo Vex"),
  person("b", "a", "Sara Quinn"),
  person("c", "b", "Dust Pham"),
];

function cardFor(name: string) {
  return screen.getByText(name).closest("[class*='border']") as HTMLElement;
}

describe("FamilyTree", () => {
  it("tells assistive tech whether a branch is open and what it controls", () => {
    render(<FamilyTree roster={roster} viewerUserId="z" />);
    const marlo = screen.getByRole("button", {
      name: "People Marlo Vex invited",
    });
    expect(marlo.getAttribute("aria-expanded")).toBe("true");
    const list = document.getElementById(marlo.getAttribute("aria-controls")!);
    expect(within(list!).getByText("Sara Quinn")).toBeTruthy();

    const sara = screen.getByRole("button", {
      name: "People Sara Quinn invited",
    });
    expect(sara.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(sara);
    expect(sara.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Dust Pham")).toBeTruthy();
    // A leaf has nothing to open, so it has no button.
    expect(
      screen.queryByRole("button", { name: "People Dust Pham invited" }),
    ).toBeNull();
  });

  it("highlights only the person the search found", () => {
    render(<FamilyTree roster={roster} viewerUserId="z" />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search the family tree" }),
      { target: { value: "dust" } },
    );
    expect(cardFor("Dust Pham").className).toContain("border-accent");
    expect(cardFor("Sara Quinn").className).not.toContain("border-accent");
    expect(cardFor("Marlo Vex").className).not.toContain("border-accent");
  });

  it("counts descendants with the shared label", () => {
    render(<FamilyTree roster={roster} viewerUserId="z" />);
    expect(screen.getByText("2 descendants")).toBeTruthy();
  });

  it("names the inviter for a member, who gets no one else's code", () => {
    const memberView = roster.map((r) => ({ ...r, inviteCode: null }));
    render(<FamilyTree roster={memberView} viewerUserId="z" />);
    expect(screen.getByText("root")).toBeTruthy();
    expect(screen.getByText("via Marlo Vex")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search by name…")).toBeTruthy();
  });

  it("shows codes and code search to a captain", () => {
    render(<FamilyTree roster={roster} viewerUserId="z" showsInviteCodes />);
    expect(screen.getByText("via code-b")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Search by name or invite code…"),
    ).toBeTruthy();
  });
});
