import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// A captain held by a required form cannot reach Display, so the form's page
// carries voice's off switch (follow-up to #369). It only ever turns voice off.

vi.mock("@/app/(console)/voice-actions", () => ({ setVoiceOn: vi.fn() }));

import { setVoiceOn } from "@/app/(console)/voice-actions";
import { VoiceOffLine } from "../voice-off-line";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VoiceOffLine", () => {
  it("turns voice off, never on", async () => {
    vi.mocked(setVoiceOn).mockResolvedValue({ ok: true });
    render(<VoiceOffLine />);
    fireEvent.click(screen.getByRole("button", { name: "Turn voice off" }));
    expect(await screen.findByText("Voice is off.")).toBeTruthy();
    expect(setVoiceOn).toHaveBeenCalledTimes(1);
    expect(setVoiceOn).toHaveBeenCalledWith(false);
  });

  it("says when it didn't save, and keeps the switch", async () => {
    vi.mocked(setVoiceOn).mockResolvedValue({ ok: false });
    render(<VoiceOffLine />);
    fireEvent.click(screen.getByRole("button", { name: "Turn voice off" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /didn't save/,
    );
    expect(screen.getByRole("button", { name: "Turn voice off" })).toBeTruthy();
  });
});
