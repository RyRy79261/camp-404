"use client";

import * as React from "react";
import {
  Check,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Textarea } from "@camp404/ui/components/textarea";
import { cn } from "@camp404/ui/lib/utils";
import { useVoiceRecorder } from "./use-voice-recorder";
import { Waveform } from "./waveform";

interface RecorderPanelProps {
  /** Called with the committed transcript once the member taps "Use this text". */
  onTranscript: (text: string) => void;
  /** Collapse the panel back to the "Dictate instead" trigger. */
  onDismiss: () => void;
  /** Server-known prompt domain key (e.g. "questionnaire"). */
  promptKey?: string;
  /** Hard cap on a single clip; forwarded to the recorder hook. */
  maxDurationMs?: number;
}

// Board S21 ring is a fixed 96×96 circle whose fill / stroke / icon-tint carry
// the state. idle is the only interactive ring (tap to record); error offers an
// explicit "Try again" button below, so its ring stays a decorative visual.
const RING_BASE = "flex h-24 w-24 items-center justify-center rounded-full";

/**
 * Bordered dictation panel (board S21). A 96px state ring, live waveform +
 * timer while recording, and a transcript-review step: each completed clip is
 * held for the member to read and edit, then committed to the parent's text
 * value via `onTranscript` only on "Use this text". The panel stays open after
 * a commit so the member can dictate again. Modelled on intake-tracker's
 * bug-report voice-recorder card; appears in place of the dictation trigger
 * inside a host field.
 */
export function RecorderPanel({
  onTranscript,
  onDismiss,
  promptKey,
  maxDurationMs,
}: RecorderPanelProps) {
  const {
    state,
    error,
    start,
    stop,
    reset,
    accept,
    discard,
    analyser,
    transcript,
  } = useVoiceRecorder({ onTranscript, promptKey, maxDurationMs });

  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [editedTranscript, setEditedTranscript] = React.useState("");

  React.useEffect(() => {
    if (state !== "recording") {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [state]);

  // Seed the editable copy whenever a fresh transcript arrives for review.
  React.useEffect(() => {
    if (transcript !== null) setEditedTranscript(transcript);
  }, [transcript]);

  const isRecording = state === "recording";
  const isBusy = state === "processing" || state === "requesting";
  const reviewing = state === "transcript-review";

  const seconds = Math.floor(elapsedMs / 1000);
  const mmss = `${Math.floor(seconds / 60)}:${(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

  // Centred state name doubles as the AT status line (the board labels are the
  // state-machine names); error is tinted destructive.
  const stateLabel =
    state === "requesting"
      ? "Requesting access"
      : state === "recording"
        ? "Recording"
        : state === "processing"
          ? "Processing"
          : state === "error"
            ? "Error"
            : "Idle";

  return (
    <div
      role="group"
      aria-label="Voice dictation"
      className={cn(
        "relative rounded-md border bg-card p-4",
        state === "error" ? "border-destructive" : "border-border",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        aria-label="Close dictation"
        disabled={isRecording || isBusy}
        className="absolute right-2 top-2"
      >
        <X className="h-4 w-4" />
      </Button>

      {reviewing ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5" aria-live="polite">
            <Check className="h-4 w-4 text-accent" aria-hidden />
            <p className="text-sm font-semibold text-foreground">
              Transcript ready — review &amp; edit
            </p>
          </div>
          <Textarea
            aria-label="Edit transcript"
            value={editedTranscript}
            onChange={(e) => setEditedTranscript(e.currentTarget.value)}
            rows={4}
            className="border-border bg-muted"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => discard()}
            >
              Re-record
            </Button>
            <Button
              type="button"
              variant="default"
              className="flex-1"
              onClick={() => accept(editedTranscript)}
            >
              Use this text
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3.5 pt-1 text-center">
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "text-xs font-bold uppercase tracking-wide",
              state === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {stateLabel}
          </p>

          {state === "idle" ? (
            <button
              type="button"
              onClick={() => void start()}
              aria-label="Start recording"
              className={cn(
                RING_BASE,
                "border border-border bg-muted text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              )}
            >
              <Mic className="h-7 w-7" aria-hidden />
            </button>
          ) : (
            <div
              aria-hidden
              className={cn(
                RING_BASE,
                state === "requesting" &&
                  "border-2 border-accent bg-muted text-accent",
                state === "recording" &&
                  "border-2 border-primary bg-primary/15 text-primary",
                state === "processing" &&
                  "border-2 border-accent bg-muted text-accent",
                state === "error" &&
                  "border-2 border-destructive bg-destructive/12 text-destructive",
              )}
            >
              {state === "processing" ? (
                <Loader2 className="h-7 w-7 motion-safe:animate-spin" />
              ) : state === "error" ? (
                <MicOff className="h-7 w-7" />
              ) : (
                <Mic className="h-7 w-7" />
              )}
            </div>
          )}

          {isRecording && (
            <>
              <Waveform analyser={analyser} active={isRecording} />
              <p className="font-mono text-sm font-semibold text-primary">
                {mmss} · Listening…
              </p>
              <Button
                type="button"
                variant="default"
                className="w-full gap-2"
                onClick={stop}
              >
                <Square className="h-4 w-4 fill-current" />
                Stop &amp; transcribe
              </Button>
            </>
          )}

          {state === "idle" && (
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-muted-foreground">
                Tap to start
              </p>
              <p className="text-xs text-muted-foreground">Mic ready</p>
            </div>
          )}

          {state === "requesting" && (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">
                Allow microphone access
              </p>
              <p className="text-xs text-muted-foreground">
                Your browser is asking permission to use the mic.
              </p>
            </div>
          )}

          {state === "processing" && (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-accent">Transcribing…</p>
              <p className="text-xs text-muted-foreground">
                Turning your audio into text.
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-2">
              <div className="space-y-0.5">
                <p
                  role="alert"
                  className="text-sm font-semibold text-destructive"
                >
                  {error ?? "Couldn’t reach the mic"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Check that Camp 404 has microphone permission, then try again.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={reset}
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
