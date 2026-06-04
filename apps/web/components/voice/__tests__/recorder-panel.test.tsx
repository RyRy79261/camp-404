import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RecorderState } from "../use-voice-recorder";

// Mock the hook so the panel can be driven through every state without the
// MediaRecorder / getUserMedia / fetch machinery. The mutable `hook` object is
// re-pointed per test before render.
const fns = {
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  accept: vi.fn(),
  discard: vi.fn(),
};
const hook: {
  state: RecorderState;
  error: string | null;
  transcript: string | null;
} = { state: "idle", error: null, transcript: null };

vi.mock("../use-voice-recorder", () => ({
  useVoiceRecorder: () => ({ ...hook, ...fns, analyser: null }),
}));

import { RecorderPanel } from "../recorder-panel";

const onTranscript = vi.fn();
const onDismiss = vi.fn();

function renderPanel(over: Partial<typeof hook> = {}) {
  Object.assign(hook, { state: "idle", error: null, transcript: null }, over);
  return render(
    <RecorderPanel onTranscript={onTranscript} onDismiss={onDismiss} />,
  );
}

// The 96px ring is the panel's core visual; in idle it's a <button>, otherwise
// an inert <div>. Query it by its fixed sizing class to assert state tints.
const ring = (c: HTMLElement) => c.querySelector(".h-24") as HTMLElement;

beforeEach(() => {
  Object.values(fns).forEach((f) => f.mockReset());
  onTranscript.mockReset();
  onDismiss.mockReset();
});
afterEach(cleanup);

describe("RecorderPanel — board S21", () => {
  it("renders the idle ring as a 96px start button and calls start()", () => {
    const { container } = renderPanel();
    const r = ring(container);
    expect(r.tagName).toBe("BUTTON");
    expect(r.getAttribute("type")).toBe("button");
    expect(r.getAttribute("aria-label")).toBe("Start recording");
    expect(r.className).toContain("h-24");
    expect(r.className).toContain("w-24");
    expect(r.className).toContain("bg-muted");
    expect(r.className).toContain("border-border");
    expect(screen.getByText("Tap to start")).toBeDefined();
    fireEvent.click(r);
    expect(fns.start).toHaveBeenCalledOnce();
  });

  it("shows the permission sub-label and disables Close while requesting", () => {
    const { container } = renderPanel({ state: "requesting" });
    expect(screen.getByText("Allow microphone access")).toBeDefined();
    expect(ring(container).className).toContain("border-accent");
    expect(
      screen.getByRole("button", { name: "Close dictation" }),
    ).toHaveProperty("disabled", true);
  });

  it("shows the stop button + timer + primary ring only while recording", () => {
    const { container } = renderPanel({ state: "recording" });
    const r = ring(container);
    expect(r.className).toContain("bg-primary/15");
    expect(r.className).toContain("border-primary");
    expect(screen.getByText(/Listening…/)).toBeDefined();
    const stop = screen.getByRole("button", { name: /stop & transcribe/i });
    fireEvent.click(stop);
    expect(fns.stop).toHaveBeenCalledOnce();
  });

  it("shows a motion-safe spinner + accent ring while processing", () => {
    const { container } = renderPanel({ state: "processing" });
    expect(screen.getByText("Transcribing…")).toBeDefined();
    const r = ring(container);
    expect(r.className).toContain("border-accent");
    expect(r.querySelector("svg")?.getAttribute("class")).toContain(
      "motion-safe:animate-spin",
    );
  });

  it("surfaces the error string in an alert, tints the ring, retries via Try again", () => {
    const { container } = renderPanel({
      state: "error",
      error: "Microphone permission denied",
    });
    expect(screen.getByRole("alert").textContent).toMatch(/permission denied/i);
    expect(ring(container).className).toContain("bg-destructive/12");
    expect(ring(container).className).toContain("border-destructive");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(fns.reset).toHaveBeenCalledOnce();
  });

  it("Close calls onDismiss when idle and is disabled while busy", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close dictation" }));
    expect(onDismiss).toHaveBeenCalledOnce();

    cleanup();
    renderPanel({ state: "processing" });
    expect(
      screen.getByRole("button", { name: "Close dictation" }),
    ).toHaveProperty("disabled", true);
  });

  it("reviews a transcript: editable, commits edited text, or discards", () => {
    renderPanel({ state: "transcript-review", transcript: "bring a tent" });
    expect(screen.getByText(/Transcript ready — review/)).toBeDefined();
    const box = screen.getByLabelText("Edit transcript") as HTMLTextAreaElement;
    expect(box.value).toBe("bring a tent");
    expect(box.className).toContain("border-border");
    fireEvent.change(box, { target: { value: "bring a 4-person tent" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this text" }));
    expect(fns.accept).toHaveBeenCalledWith("bring a 4-person tent");

    fireEvent.click(screen.getByRole("button", { name: "Re-record" }));
    expect(fns.discard).toHaveBeenCalledOnce();
  });

  it("uses only short-form colour tokens (no [color:var(--color-*)])", () => {
    const { container } = renderPanel({ state: "error", error: "x" });
    expect(container.innerHTML).not.toContain("[color:var(--color-");
  });
});
