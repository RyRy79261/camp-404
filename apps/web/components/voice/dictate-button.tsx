"use client";

import * as React from "react";
import { cn } from "@camp404/ui/lib/utils";
import { useVoiceRecorder } from "./use-voice-recorder";

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

interface DictateButtonProps {
  /** Called with the transcript once Whisper returns. */
  onTranscript: (text: string) => void;
  /** Server-known prompt domain key (e.g. "questionnaire"). */
  promptKey?: string;
  className?: string;
}

const STATE_LABEL: Record<string, string> = {
  idle: "Dictate",
  requesting: "Allow mic…",
  recording: "Stop",
  processing: "Transcribing…",
  error: "Try again",
};

/**
 * Tap-to-toggle dictation button. Calls `onTranscript(text)` once Whisper
 * has returned. The caller decides where to insert the text — typically
 * spliced at the textarea's cursor position.
 */
export function DictateButton({
  onTranscript,
  promptKey,
  className,
}: DictateButtonProps) {
  const { state, error, start, stop, reset } = useVoiceRecorder({
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

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        aria-pressed={isRecording}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 self-end rounded-full border px-3 text-xs font-medium transition-colors",
          isRecording
            ? "border-red-600 bg-red-600 text-white"
            : "border-[color:var(--color-border)] bg-transparent hover:bg-[color:var(--color-muted)]",
          isBusy && "opacity-60",
        )}
      >
        {isBusy ? (
          <SpinnerIcon className="h-3.5 w-3.5" />
        ) : isRecording ? (
          <StopIcon className="h-3 w-3" />
        ) : (
          <MicIcon className="h-3.5 w-3.5" />
        )}
        <span>{STATE_LABEL[state] ?? "Dictate"}</span>
      </button>
      {error && (
        <p className="self-end text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
