import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVoiceRecorder } from "../use-voice-recorder";

// The microphone stops when the page holding it goes. On the desktop a page
// goes whenever its window closes, minimises or gives way to another (only
// the focused window's page is mounted), so closing the announcements
// composer's window, or going Back out of it, never leaves it listening.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fakeMicrophone() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const recorder = {
    state: "inactive" as "inactive" | "recording",
    start: vi.fn(function (this: { state: string }) {
      recorder.state = "recording";
    }),
    stop: vi.fn(() => {
      recorder.state = "inactive";
    }),
    ondataavailable: null as unknown,
    onstop: null as unknown,
    onerror: null as unknown,
    mimeType: "audio/webm",
  };
  const close = vi.fn(async () => {});
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn(async () => stream) },
  });
  vi.stubGlobal(
    "AudioContext",
    vi.fn(function AudioContext() {
      return {
        createMediaStreamSource: () => ({ connect: () => {} }),
        createAnalyser: () => ({ fftSize: 0 }),
        close,
      };
    }),
  );
  const MediaRecorder = Object.assign(
    vi.fn(function MediaRecorder() {
      return recorder;
    }),
    { isTypeSupported: () => true },
  );
  vi.stubGlobal("MediaRecorder", MediaRecorder);
  return { track, recorder, close };
}

describe("useVoiceRecorder", () => {
  it("stops the recording and releases the microphone when its page goes", async () => {
    const mic = fakeMicrophone();
    const { result, unmount } = renderHook(() =>
      useVoiceRecorder({ onTranscript: () => {} }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");
    expect(mic.track.stop).not.toHaveBeenCalled();

    unmount();
    expect(mic.recorder.stop).toHaveBeenCalled();
    expect(mic.track.stop).toHaveBeenCalled();
    expect(mic.close).toHaveBeenCalled();
  });
});
