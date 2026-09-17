import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as InviteWords from "@/lib/invite-words";

vi.mock("./actions", () => ({ createInviteAction: vi.fn() }));
vi.mock("@/lib/invite-words", async (importOriginal) => ({
  ...(await importOriginal<typeof InviteWords>()),
  generateInviteCode: () => "dusty-otter",
}));

import { createInviteAction } from "./actions";
import { InviteForm } from "./invite-form";

// The invite form's two hand-offs: a saved code moves focus to the result, and
// a code someone else saved first shows as taken.

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ available: true })),
  );
});

async function submitWhenAvailable() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create invite" }),
    ).toHaveProperty("disabled", false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
}

describe("InviteForm", () => {
  it("moves focus to the result once the invite is saved", async () => {
    vi.mocked(createInviteAction).mockResolvedValue({
      ok: true,
      code: "dusty-otter",
      recipientName: null,
      maxUses: 1,
      requiresApproval: true,
    });
    render(<InviteForm isCaptain={false} />);
    await submitWhenAvailable();

    const heading = await screen.findByRole("heading", {
      name: "Invite ready",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("shows a code another member saved first as taken", async () => {
    vi.mocked(createInviteAction).mockResolvedValue({
      ok: false,
      error: "'dusty-otter' is already taken.",
      taken: "dusty-otter",
    });
    render(<InviteForm isCaptain={false} />);
    await submitWhenAvailable();

    await screen.findByText("'dusty-otter' is already taken.");
    expect(
      screen.getByRole("button", { name: "Create invite" }),
    ).toHaveProperty("disabled", true);
  });
});
