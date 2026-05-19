"use client";

import * as React from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { cn } from "@camp404/ui/lib/utils";
import { useVoiceRecorder } from "./use-voice-recorder";
import { Waveform } from "./waveform";

interface DictateButtonProps {
  /** Called with the transcript once Whisper has returned. */
  onTranscript: (text: string) => void;
  /** Server-known prompt domain key (e.g. "questionnaire"). */
  promptKey?: string;
  className?: string;
}

/**
 * Vertical dictation column: a small shadcn Button with a live waveform
 * beneath it. Intended to sit to the right of a textarea or input.
 *
 * - Tap to start recording; tap again to stop and transcribe.
 * - Tap once after an error to reset.
 * - Waveform only animates while actively recording.
 */
export function DictateButton({
  onTranscript,
  promptKey,
  className,
}: DictateButtonProps) {
  const { state, error, start, stop, reset, analyser } = useVoiceRecorder({
    onTranscript,
    promptKey,
  });

  const isRecording = state === "recording";
  const isBusy = state === "processing" || state === "requesting";

  function handleClick() {
    if (state === "error") {
      reset();
      return;
    }
    if (isRecording) stop();
    else if (!isBusy) void start();
  }

  const label =
    state === "requesting"
      ? "Allow mic"
      : state === "processing"
        ? "Transcribing"
        : isRecording
          ? "Stop"
          : state === "error"
            ? "Try again"
            : "Dictate";

  return (
    <div
      className={cn("flex w-24 flex-col items-stretch gap-1.5", className)}
    >
      <Button
        type="button"
        size="sm"
        variant={isRecording ? "destructive" : "outline"}
        onClick={handleClick}
        disabled={isBusy}
        aria-pressed={isRecording}
        aria-label={label}
        className="justify-center"
      >
        {isBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isRecording ? (
          <Square className="h-3 w-3 fill-current" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
        <span>{label}</span>
      </Button>
      <Waveform analyser={analyser} active={isRecording} />
      {error && (
        <p className="text-[10px] leading-tight text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
