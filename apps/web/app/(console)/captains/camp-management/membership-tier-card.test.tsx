import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({ setMembershipTierAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import type { MembershipTier } from "@camp404/types";
import { toast } from "@camp404/ui/components/toast";
import { MembershipTierCard } from "./membership-tier-card";
import { setMembershipTierAction } from "./actions";

// The captain's "Staying for" control. One tap writes, sending the value on
// screen as the compare-and-set's `from`; a refused write is a toast and asks
// the panel to reload, and never claims the new value.

function renderCard(tier: MembershipTier | null) {
  const onChange = vi.fn();
  const onStale = vi.fn();
  render(
    <MembershipTierCard
      userId="member-1"
      tier={tier}
      onChange={onChange}
      onStale={onStale}
    />,
  );
  return { onChange, onStale };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MembershipTierCard", () => {
  it("sets a value that was not set, sending null as what the captain saw", async () => {
    vi.mocked(setMembershipTierAction).mockResolvedValue({ ok: true });
    const { onChange } = renderCard(null);
    expect(screen.getByText(/Not set yet/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Build week only" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("build_week_only"),
    );
    expect(setMembershipTierAction).toHaveBeenCalledExactlyOnceWith({
      userId: "member-1",
      from: null,
      to: "build_week_only",
    });
  });

  it("does not write when the tapped value is already set", () => {
    renderCard("full");
    fireEvent.click(screen.getByRole("radio", { name: "Whole event" }));
    expect(setMembershipTierAction).not.toHaveBeenCalled();
  });

  it("reports a refused change as a toast and asks for a reload", async () => {
    vi.mocked(setMembershipTierAction).mockResolvedValue({
      ok: false,
      error: "Nova's stay changed while you were looking. Refresh to see it.",
    });
    const { onChange, onStale } = renderCard("full");

    fireEvent.click(screen.getByRole("radio", { name: "Build week only" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Nova's stay changed while you were looking. Refresh to see it.",
      ),
    );
    expect(onStale).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(setMembershipTierAction).toHaveBeenCalledWith({
      userId: "member-1",
      from: "full",
      to: "build_week_only",
    });
  });
});
