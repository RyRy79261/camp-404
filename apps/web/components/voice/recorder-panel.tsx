"use client";

import * as React from "react";
import { Loader2, Mic, Square, X } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { useVoiceRecorder } from "./use-voice-recorder";
import { Waveform } from "./waveform";

interface RecorderPanelProps {
  /** Called with the transcript once Whisper has returned. */
  onTranscript: (text: string) => void;
  /** Collapse the panel back to the "Dictate instead" button. */
  onDismiss: () => void;
  /** Server-known prompt domain key (e.g. "questionnaire"). */
  promptKey?: string;
}

/**
 * Bordered dictation panel: a big circular record button, live waveform,
 * elapsed timer. Modelled on RyRy79261/intake-tracker's bug-report
 * voice-recorder card — appears below a text input when the user opts
 * in to dictation. Each completed recording appends to the parent's
 * text value via `onTranscript`; the panel stays open so the user can
 * record again without re-tapping "Dictate instead".
 */
export function RecorderPanel({
  onTranscript,
  onDismiss,
  promptKey,
}: RecorderPanelProps) {
  const { state, error, start, stop, reset, analyser } = useVoiceRecorder({
    onTranscript,
    promptKey,
  });
  const [elapsedMs, setElapsedMs] = React.useState(0);

  React.useEffect(() => {
    if (state !== "recording") {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [state]);

  const isRecording = state === "recording";
  const isBusy = state === "processing" || state === "requesting";

  function handlePrimary() {
    if (state === "error") {
      reset();
      return;
    }
    if (isRecording) stop();
    else if (!isBusy) void start();
  }

  const statusLabel =
    state === "requesting"
      ? "Allow microphone…"
      : state === "processing"
        ? "Transcribing…"
        : isRecording
          ? "Recording"
          : state === "error"
            ? "Tap to retry"
            : "Tap to record";

  const seconds = Math.floor(elapsedMs / 1000);
  const mmss = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{statusLabel}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          aria-label="Close dictation"
          disabled={isRecording || isBusy}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-center">
        <Button
          type="button"
          size="lg"
          variant={isRecording ? "destructive" : "default"}
          onClick={handlePrimary}
          disabled={isBusy}
          className="h-16 w-16 rounded-full p-0"
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isBusy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isRecording ? (
            <Square className="h-6 w-6 fill-current" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
      </div>
      <Waveform analyser={analyser} active={isRecording} />
      {isRecording && (
        <p className="text-center font-mono text-xs text-[color:var(--color-muted-foreground)]">
          {mmss}
        </p>
      )}
      {error && (
        <p
          className="text-center text-xs text-[color:var(--color-destructive)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
