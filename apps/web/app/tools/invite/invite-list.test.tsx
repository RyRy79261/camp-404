import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const refresh = vi.fn();
const router = { refresh, push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./actions", () => ({ revokeInviteAction: vi.fn() }));

import { revokeInviteAction } from "./actions";
import { InviteList, type InviteListItem } from "./invite-list";

const NOW = new Date("2026-09-16T10:00:00Z");

function item(over: Partial<InviteListItem> = {}): InviteListItem {
  return {
    code: "neon-toaster-mongoose",
    note: "Kitchen lead",
    maxUses: 3,
    useCount: 1,
    expiresAt: null,
    revokedAt: null,
    requiresApproval: true,
    createdAt: new Date("2026-09-10T08:00:00Z"),
    createdByName: "Ada",
    mine: true,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  refresh.mockReset();
  vi.mocked(revokeInviteAction).mockReset();
});

describe("InviteList", () => {
  it("shows each code's state, uses, and approval, with Revoke only while active", () => {
    render(
      <InviteList
        isCaptain={false}
        now={NOW}
        items={[
          item(),
          item({ code: "used-up-code", useCount: 3 }),
          item({ code: "gone-code", revokedAt: NOW }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your invites" })).toBeDefined();
    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]!).getByText("Active")).toBeDefined();
    expect(
      within(cards[0]!).getByText(/1 of 3 used · Needs a captain's approval/),
    ).toBeDefined();
    expect(
      within(cards[0]!).getByRole("button", { name: "Revoke" }),
    ).toBeDefined();
    expect(within(cards[1]!).getByText("Used up")).toBeDefined();
    expect(within(cards[1]!).queryByRole("button")).toBeNull();
    expect(within(cards[2]!).getByText("Revoked")).toBeDefined();
    expect(within(cards[2]!).queryByRole("button")).toBeNull();
  });

  it("names the maker of someone else's code for a captain", () => {
    render(
      <InviteList
        isCaptain
        now={NOW}
        items={[
          item({ mine: false, createdByName: "Bo" }),
          item({
            code: "meowzit",
            mine: false,
            createdByName: null,
            maxUses: 100,
            requiresApproval: true,
          }),
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "All invite codes" }),
    ).toBeDefined();
    expect(screen.getByText(/by Bo$/)).toBeDefined();
    expect(screen.getByText(/by the camp$/)).toBeDefined();
  });

  it("confirms, revokes, and refreshes", async () => {
    vi.mocked(revokeInviteAction).mockResolvedValue({ ok: true });
    render(<InviteList isCaptain={false} now={NOW} items={[item()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Revoke neon-toaster-mongoose?"),
    ).toBeDefined();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Revoke code" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(revokeInviteAction).toHaveBeenCalledWith("neon-toaster-mongoose");
  });

  it("keeps the dialog open with the reason when a revoke is refused", async () => {
    vi.mocked(revokeInviteAction).mockResolvedValue({
      ok: false,
      error: "That code is already revoked.",
    });
    render(<InviteList isCaptain={false} now={NOW} items={[item()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke code" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code is already revoked.",
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });
});
