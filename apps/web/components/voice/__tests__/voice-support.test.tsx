import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  isVoiceRecordingSupported,
  useVoiceSupported,
} from "../use-voice-recorder";

// The Dictate pill opens a recorder, and a browser without MediaRecorder or
// getUserMedia can only fail inside it. These pin the check the three pill
// sites use to hide it.

function Probe() {
  return <span>{useVoiceSupported() ? "can record" : "cannot record"}</span>;
}

function stubRecordingBrowser() {
  vi.stubGlobal("MediaRecorder", class {});
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("voice recording support", () => {
  it("is false without MediaRecorder, as in jsdom and older browsers", () => {
    expect(typeof MediaRecorder).toBe("undefined");
    expect(isVoiceRecordingSupported()).toBe(false);
    render(<Probe />);
    expect(screen.getByText("cannot record")).toBeTruthy();
  });

  it("is false with MediaRecorder but no microphone API", () => {
    vi.stubGlobal("MediaRecorder", class {});
    expect(isVoiceRecordingSupported()).toBe(false);
  });

  it("is true when the browser has both", () => {
    stubRecordingBrowser();
    expect(isVoiceRecordingSupported()).toBe(true);
    render(<Probe />);
    expect(screen.getByText("can record")).toBeTruthy();
  });
});
