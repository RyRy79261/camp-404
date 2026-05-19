"use client";

import * as React from "react";

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "error";

export interface UseVoiceRecorderOptions {
  /** Called once a transcript is back. */
  onTranscript: (text: string) => void;
  /**
   * Server-known prompt domain key. Echoed to `/api/voice/transcribe` which
   * looks up the matching Whisper bias string. Keep it on the server so the
   * client can't inject arbitrary prompts.
   */
  promptKey?: string;
  /** Hard cap on a single clip. Defaults to 2 minutes. */
  maxDurationMs?: number;
}

const SUPPORTED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // iOS Safari 14.3+
  "audio/ogg;codecs=opus",
];

/**
 * Picks the first MIME type the current browser actually supports.
 * Hardcoding `audio/webm` makes iOS Safari silently fail — this is the
 * single biggest cross-browser gotcha per the voice brief.
 */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of SUPPORTED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

/**
 * Cross-browser MediaRecorder wrapper. Records on `start()`, transcribes
 * via `/api/voice/transcribe` on `stop()`, and calls `onTranscript` with
 * the result. While recording, exposes an `AnalyserNode` consumers can
 * read to draw a live waveform. On native Capacitor builds the start/stop
 * calls should route through `@capgo/capacitor-voice-recorder` instead —
 * see the //TODO inside start().
 */
export function useVoiceRecorder({
  onTranscript,
  promptKey,
  maxDurationMs = 120_000,
}: UseVoiceRecorderOptions) {
  const [state, setState] = React.useState<RecorderState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [analyser, setAnalyser] = React.useState<AnalyserNode | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      // Critical cleanup per the voice brief: clear handlers BEFORE stop()
      // so a queued onstop doesn't setState on an unmounted component.
      const rec = recorderRef.current;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.onerror = null;
        if (rec.state !== "inactive") rec.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function safeSet<T>(setter: (v: T) => void, value: T) {
    if (mountedRef.current) setter(value);
  }

  function teardownAudio() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    safeSet(setAnalyser, null);
  }

  async function start() {
    if (state === "recording" || state === "requesting") return;
    setError(null);
    safeSet(setState, "requesting");

    // TODO(capacitor): when running natively, swap MediaRecorder for the
    // capacitor-voice-recorder plugin (returns base64 m4a). Detect via
    // `Capacitor.isNativePlatform()`.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Analyser for the live waveform UI. fftSize 1024 per the voice
      // brief — large enough for a smooth wave, small enough that the
      // RAF loop stays cheap.
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      source.connect(node);
      audioCtxRef.current = ctx;
      safeSet(setAnalyser, node);

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        safeSet(setError, "Recording failed");
        safeSet(setState, "error");
        teardownAudio();
      };
      rec.onstop = () => {
        void handleStop(mimeType ?? rec.mimeType);
      };

      rec.start();
      safeSet(setState, "recording");
      timeoutRef.current = setTimeout(() => stop(), maxDurationMs);
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      const message =
        name === "NotAllowedError"
          ? "Microphone permission denied"
          : name === "NotFoundError"
            ? "No microphone found"
            : "Couldn't access microphone";
      safeSet(setError, message);
      safeSet(setState, "error");
      teardownAudio();
    }
  }

  function stop() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    rec.stop();
  }

  async function handleStop(mimeType: string) {
    safeSet(setState, "processing");
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      teardownAudio();
      recorderRef.current = null;

      if (blob.size === 0) {
        safeSet(setState, "idle");
        return;
      }

      const form = new FormData();
      form.append(
        "audio",
        new File([blob], `clip.${mimeType.includes("mp4") ? "m4a" : "webm"}`, {
          type: mimeType,
        }),
      );
      if (promptKey) form.append("promptKey", promptKey);

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Transcription failed (${res.status})`);
      }
      const data = (await res.json()) as { text: string };
      if (data.text.trim()) onTranscript(data.text);
      safeSet(setState, "idle");
    } catch (err) {
      safeSet(
        setError,
        err instanceof Error ? err.message : "Transcription failed",
      );
      safeSet(setState, "error");
    }
  }

  function reset() {
    setError(null);
    safeSet(setState, "idle");
  }

  return { state, error, start, stop, reset, analyser };
}
