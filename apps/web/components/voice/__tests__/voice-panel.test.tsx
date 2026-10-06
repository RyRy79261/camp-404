import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The Voice panel (#356), drawn from a command's state: the one-time notice,
// the ticked list, the question, the results, and no internet.

const actions = vi.hoisted(() => ({
  setVoiceOn: vi.fn(async () => ({ ok: true })),
  runVoiceList: vi.fn(),
}));
vi.mock("@/app/(console)/voice-actions", () => actions);

import type { VoiceRow } from "@/lib/voice/resolve";
import { VOICE_OFFLINE, useVoiceCommand, type VoiceCommand } from "../use-voice-command";
import { VoiceBody } from "../voice-panel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (sentence: string, over: Partial<VoiceRow> = {}): VoiceRow => ({
  tool: "x",
  sentence,
  facts: "Facts",
  path: "/x",
  dependsOn: null,
  blocked: null,
  ...over,
});

function voice(over: Partial<VoiceCommand>): VoiceCommand {
  return {
    phase: "outcome",
    words: "Three things",
    outcome: null,
    shown: null,
    ticked: new Set(),
    results: null,
    error: null,
    analyser: null,
    startedAt: null,
    supported: true,
    online: true,
    start: vi.fn(),
    stop: vi.fn(),
    discard: vi.fn(),
    toggle: vi.fn(),
    pick: vi.fn(),
    run: vi.fn(),
    reset: vi.fn(),
    consent: vi.fn(),
    ...over,
  } as VoiceCommand;
}

describe("the Voice panel", () => {
  it("shows the one-time notice first, and turns voice on only on Turn on voice", async () => {
    const { result } = renderHook(() => useVoiceCommand({ consented: false }));
    expect(result.current.phase).toBe("consent");
    render(<VoiceBody voice={result.current} onClose={vi.fn()} />);
    expect(
      screen.getByText(/Your voice is sent to Groq to become words, and the words to Anthropic's Claude/),
    ).toBeTruthy();
    expect(actions.setVoiceOn).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.consent(true);
    });
    expect(actions.setVoiceOn).toHaveBeenCalledWith(true);
    expect(result.current.phase).toBe("idle");
  });

  it("lists each action with a tick, counts the ticked ones, and never ticks one that can't be done", () => {
    const rows = [
      row("Sign you up for Breakfast cooks"),
      row("Move “Buy 30 m of shade cloth” from Doing to Done", { dependsOn: 0 }),
      row("Say you can help on Build", { blocked: "That is already your answer." }),
    ];
    const v = voice({
      outcome: { kind: "list", answers: [{ text: "Tomorrow: a call at 19:00.", path: null }], note: null, rows, token: "t", expiresAt: Date.now() + 300_000 },
      shown: { rows, token: "t", expiresAt: Date.now() + 300_000 },
      ticked: new Set([0, 1]),
    });
    render(<VoiceBody voice={v} onClose={vi.fn()} />);
    expect(screen.getByText("Tomorrow: a call at 19:00.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Do 2 actions/ })).toBeTruthy();
    expect(screen.getByText(/Runs only if 1 works/)).toBeTruthy();
    const third = screen.getByRole("checkbox", { name: /3\. Say you can help on Build/ }) as HTMLInputElement;
    expect(third.disabled).toBe(true);
    expect(third.checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /1\. Sign you up/ }));
    expect(v.toggle).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: /Do 2 actions/ }));
    expect(v.run).toHaveBeenCalled();
    expect(screen.getByText(/Nothing saved yet · expires/)).toBeTruthy();
  });

  it("asks one question with two options, shows what waits, and offers to cancel all", () => {
    const pickA = row("Breakfast cooks · 07:00–09:00");
    const pickB = row("Breakfast wash-up · 09:00–10:00");
    const v = voice({
      outcome: {
        kind: "ask",
        answers: [],
        question: "Which breakfast shift on Wed 28 Apr?",
        options: [
          { rows: [pickA], token: "a", expiresAt: 0, choice: pickA },
          { rows: [pickB], token: "b", expiresAt: 0, choice: pickB },
        ],
        waiting: [row("Move “Buy 30 m of shade cloth” to Done")],
      },
    });
    const onClose = vi.fn();
    render(<VoiceBody voice={v} onClose={onClose} />);
    expect(screen.getByText("Which breakfast shift on Wed 28 Apr?")).toBeTruthy();
    fireEvent.click(screen.getByText("Breakfast wash-up · 09:00–10:00"));
    expect(v.pick).toHaveBeenCalledWith(1);
    expect(screen.getByText(/Waiting, shown with this one before anything runs/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Neither, cancel all" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("gives one result per action", () => {
    const v = voice({
      phase: "results",
      results: [
        { index: 0, status: "done", sentence: "You are on Breakfast cooks.", detail: "3 shifts this year.", path: "/shifts" },
        { index: 1, status: "not_done", sentence: "Move the task", detail: "Someone else moved this task. Nothing changed.", path: "/tasks" },
        { index: 2, status: "done", sentence: "You can help on Build.", detail: null, path: "/logistics" },
      ],
    });
    render(<VoiceBody voice={v} onClose={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("2 done, 1 not done");
    const notDone = document.querySelector<HTMLElement>('[data-voice-result="not_done"]')!;
    expect(within(notDone).getByText(/Someone else moved this task/)).toBeTruthy();
    expect(within(notDone).getByRole("link", { name: "Open the page" }).getAttribute("href")).toBe("/tasks");
  });

  it("is off without internet, and points to the printed sheets", () => {
    render(<VoiceBody voice={voice({ online: false, phase: "idle" })} onClose={vi.fn()} />);
    expect(screen.getByText(VOICE_OFFLINE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start speaking" })).toBeNull();
  });
});
