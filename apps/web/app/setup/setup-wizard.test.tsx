import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The action runs server-side; here we just spy that it fires (the wizard
// navigates home itself on success).
const { actionSpy, pushSpy } = vi.hoisted(() => ({
  actionSpy: vi.fn(),
  pushSpy: vi.fn(),
}));
vi.mock("./actions", () => ({ completeSetupAction: actionSpy }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushSpy }) }));

import { SetupRefused, SetupWizard } from "./setup-wizard";

afterEach(() => {
  cleanup();
  actionSpy.mockReset();
  pushSpy.mockReset();
});

describe("SetupWizard", () => {
  it("frames founding the camp: eyebrow, heading, the root code, the greeting", () => {
    render(<SetupWizard displayName="Ada" founderCode="meowzit" />);
    expect(
      screen.getByRole("heading", { name: "Set up Camp 404" }),
    ).toBeDefined();
    expect(screen.getByText("First-time setup")).toBeDefined();
    expect(screen.getByText("meowzit")).toBeDefined();
    expect(screen.getByText(/Ada/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /set up camp & become captain/i }),
    ).toBeDefined();
  });

  it("invokes the setup action then navigates home on success", async () => {
    actionSpy.mockResolvedValueOnce({ ok: true });
    render(<SetupWizard displayName="Ada" founderCode="meowzit" />);
    fireEvent.click(
      screen.getByRole("button", { name: /set up camp & become captain/i }),
    );
    await waitFor(() => expect(actionSpy).toHaveBeenCalledOnce());
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/"));
  });

  it("says so when the camp was already set up, and stays put", async () => {
    // Two people had /setup open, and the other one finished first.
    actionSpy.mockResolvedValueOnce({
      ok: false,
      error: "Camp 404 is already set up.",
    });
    render(<SetupWizard displayName="Ada" founderCode="meowzit" />);
    fireEvent.click(
      screen.getByRole("button", { name: /set up camp & become captain/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/already set up/),
    );
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("surfaces an inline error when the action throws", async () => {
    actionSpy.mockRejectedValueOnce(new Error("boom"));
    render(<SetupWizard displayName="Ada" founderCode="meowzit" />);
    fireEvent.click(
      screen.getByRole("button", { name: /set up camp & become captain/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/couldn.t set up/i),
    );
    expect(pushSpy).not.toHaveBeenCalled();
  });
});

describe("SetupRefused", () => {
  it("says why in the wizard's gate, offers a way out, and no setup button", () => {
    render(<SetupRefused message="Only the founding address can set up." />);
    expect(
      screen.getByRole("heading", { name: "Set up Camp 404" }),
    ).toBeDefined();
    expect(
      screen.getByText("Only the founding address can set up."),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Sign out" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /set up camp & become captain/i }),
    ).toBeNull();
    expect(actionSpy).not.toHaveBeenCalled();
  });
});
