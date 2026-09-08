import { beforeEach, describe, expect, it, vi } from "vitest";

// deleteOwnAccount — the self-service erasure endpoint. Two gates stand between
// a captain and an unrecoverable camp: the cheap `canLeaveCamp` pre-check here,
// and the recount inside `sanitiseAccount`'s transaction (packages/db) that the
// pre-check cannot speak for. These assert BOTH refusals reach the member as
// the same sentence, and that a refusal never signs them out.

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  setDisplayName: vi.fn(),
  setProfileImage: vi.fn(),
}));
vi.mock("@/lib/bootstrap", () => ({
  countActiveCaptains: vi.fn(async () => 2),
}));
vi.mock("@/lib/account", () => ({ deleteAccount: vi.fn() }));

import { redirect } from "next/navigation";
import { deleteOwnAccount } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { countActiveCaptains } from "@/lib/bootstrap";
import { deleteAccount } from "@/lib/account";

const SOLE_CAPTAIN_ERROR =
  "You're the last captain — promote another member to captain before erasing your account.";

function signIn(rank: "captain" | "member", id = "user-1") {
  vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "u@example.com",
    displayName: "U",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id, rank } as never);
}

function confirmed(value = "DELETE"): FormData {
  const fd = new FormData();
  fd.set("confirm", value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(countActiveCaptains).mockResolvedValue(2);
  vi.mocked(deleteAccount).mockResolvedValue({ ok: true, lostCatNumber: 3 });
});

describe("deleteOwnAccount", () => {
  it("requires the typed confirmation before erasing anything", async () => {
    signIn("member");

    const res = await deleteOwnAccount(null, confirmed("delete"));

    expect(res).toEqual({ ok: false, error: "Type DELETE to confirm." });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("erases and signs out a member the guards clear", async () => {
    signIn("member");

    await deleteOwnAccount(null, confirmed());

    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-out");
  });

  it("refuses a sole captain on the pre-check, without calling the eraser", async () => {
    signIn("captain");
    vi.mocked(countActiveCaptains).mockResolvedValue(1);

    const res = await deleteOwnAccount(null, confirmed());

    expect(res).toEqual({ ok: false, error: SOLE_CAPTAIN_ERROR });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("surfaces the same sentence when the transaction is the one that refuses", async () => {
    // The race: the pre-check counted two captains, and the peer erased
    // themselves before this request reached the transaction. The member must
    // NOT be signed out — nothing was erased.
    signIn("captain");
    vi.mocked(deleteAccount).mockResolvedValue({
      ok: false,
      reason: "sole_captain",
    });

    const res = await deleteOwnAccount(null, confirmed());

    expect(res).toEqual({ ok: false, error: SOLE_CAPTAIN_ERROR });
    expect(redirect).not.toHaveBeenCalled();
  });
});
