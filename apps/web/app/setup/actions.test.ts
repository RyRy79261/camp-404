import { beforeEach, describe, expect, it, vi } from "vitest";

// /setup elects the caller as founding captain on a fresh database. Sign-up
// is open, so the load-bearing assertion for a refused account is that
// runFirstTimeSetup was never called, not only the sentence it gets back.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/bootstrap", () => ({
  isCampBootstrapped: vi.fn(),
  mayFoundCamp: vi.fn(),
  runFirstTimeSetup: vi.fn(),
  SETUP_REFUSED_MESSAGE: "refused sentence",
}));

import { revalidatePath } from "next/cache";
import { completeSetupAction } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  isCampBootstrapped,
  mayFoundCamp,
  runFirstTimeSetup,
} from "@/lib/bootstrap";

const user = { id: "auth-1", primaryEmail: "x@example.com", displayName: "X" };

describe("completeSetupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue(user as never);
    vi.mocked(isCampBootstrapped).mockResolvedValue(false);
    vi.mocked(mayFoundCamp).mockReturnValue(true);
    vi.mocked(runFirstTimeSetup).mockResolvedValue({ ok: true });
  });

  it("refuses an account that may not found the camp, and elects nobody", async () => {
    vi.mocked(mayFoundCamp).mockReturnValue(false);
    const res = await completeSetupAction();
    expect(res).toEqual({ ok: false, error: "refused sentence" });
    expect(mayFoundCamp).toHaveBeenCalledWith(user);
    expect(runFirstTimeSetup).not.toHaveBeenCalled();
  });

  it("elects the founder when they may found the camp", async () => {
    await expect(completeSetupAction()).resolves.toEqual({ ok: true });
    expect(runFirstTimeSetup).toHaveBeenCalledWith(user);
    // The founder is a captain now: their console redraws its manifest.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses once the camp is set up, before anything else", async () => {
    vi.mocked(isCampBootstrapped).mockResolvedValue(true);
    const res = await completeSetupAction();
    expect(res).toEqual({ ok: false, error: "Camp 404 is already set up." });
    expect(runFirstTimeSetup).not.toHaveBeenCalled();
  });
});
