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

import { SetupWizard } from "./setup-wizard";

afterEach(() => {
  cleanup();
  actionSpy.mockReset();
  pushSpy.mockReset();
});

describe("SetupWizard", () => {
  it("frames founding the camp: eyebrow, heading, the root code, the greeting", () => {
    render(<SetupWizard displayName="Ada" founderCode="meowzit" />);
    expect(screen.getByRole("heading", { name: "Set up Camp 404" })).toBeDefined();
    expect(screen.getByText("First-time setup")).toBeDefined();
    expect(screen.getByText("meowzit")).toBeDefined();
    expect(screen.getByText(/Ada/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /set up camp & become captain/i }),
    ).toBeDefined();
  });

  it("invokes the setup action then navigates home on success", async () => {
    render(<SetupWizard displayName="Ada" founderCode="meowzit" />);
    fireEvent.click(
      screen.getByRole("button", { name: /set up camp & become captain/i }),
    );
    await waitFor(() => expect(actionSpy).toHaveBeenCalledOnce());
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/"));
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
